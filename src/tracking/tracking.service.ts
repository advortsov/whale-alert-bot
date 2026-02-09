import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatUnits } from 'ethers';

import { isEthereumAddressCandidate, tryNormalizeEthereumAddress } from './address.util';
import type { HistoryCacheEntry } from './history-cache.interfaces';
import { HistoryCacheService } from './history-cache.service';
import type { HistoryPageResult } from './history-page.interfaces';
import {
  type HistoryQuotaSnapshot,
  HistoryRateLimitReason,
  HistoryRequestSource,
  type HistoryRateLimitDecision,
} from './history-rate-limiter.interfaces';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import {
  AlertFilterToggleTarget,
  type TelegramUserRef,
  type TrackedWalletOption,
  type UserAlertPreferences,
  type WalletAlertFilterState,
} from './tracking.interfaces';
import { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { HISTORY_EXPLORER_ADAPTER } from '../core/ports/explorers/explorer-port.tokens';
import type { IHistoryExplorerAdapter } from '../core/ports/explorers/history-explorer.interfaces';
import type { HistoryItemDto, HistoryPageDto } from '../features/tracking/dto/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';
import type {
  UserAlertPreferenceRow,
  UserWalletAlertPreferenceRow,
} from '../storage/database.types';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import { TrackedWalletsRepository } from '../storage/repositories/tracked-wallets.repository';
import { AlertEventFilterType } from '../storage/repositories/user-alert-preferences.interfaces';
import { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import { UserWalletAlertPreferencesRepository } from '../storage/repositories/user-wallet-alert-preferences.repository';
import { UsersRepository } from '../storage/repositories/users.repository';
import { WalletEventsRepository } from '../storage/repositories/wallet-events.repository';
import type { WalletEventHistoryView } from '../storage/repositories/wallet-events.repository.interfaces';

@Injectable()
export class TrackingService {
  private readonly logger: Logger = new Logger(TrackingService.name);
  private static readonly DEFAULT_HISTORY_LIMIT: number = 5;
  private static readonly MAX_HISTORY_LIMIT: number = 20;

  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly trackedWalletsRepository: TrackedWalletsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    @Inject(HISTORY_EXPLORER_ADAPTER)
    private readonly historyExplorerAdapter: IHistoryExplorerAdapter,
    private readonly historyCacheService: HistoryCacheService,
    private readonly historyRateLimiterService: HistoryRateLimiterService,
    private readonly userAlertPreferencesRepository: UserAlertPreferencesRepository,
    private readonly userWalletAlertPreferencesRepository: UserWalletAlertPreferencesRepository,
    private readonly walletEventsRepository: WalletEventsRepository,
    private readonly appConfigService: AppConfigService,
  ) {}

  public async trackAddress(
    userRef: TelegramUserRef,
    rawAddress: string,
    label: string | null,
  ): Promise<string> {
    this.logger.debug(
      `trackAddress start telegramId=${userRef.telegramId} rawAddress=${rawAddress} label=${label ?? 'n/a'}`,
    );
    if (!isEthereumAddressCandidate(rawAddress)) {
      this.logger.warn(
        `trackAddress invalid format telegramId=${userRef.telegramId} rawAddress=${rawAddress}`,
      );
      throw new Error(
        [
          'Неверный Ethereum адрес.',
          'Ожидаю формат 0x + 40 hex-символов.',
          'Пример: /track 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
        ].join('\n'),
      );
    }

    const normalizedAddress: string | null = tryNormalizeEthereumAddress(rawAddress);

    if (!normalizedAddress) {
      this.logger.warn(
        `trackAddress invalid checksum telegramId=${userRef.telegramId} rawAddress=${rawAddress}`,
      );
      throw new Error(
        [
          'Неверный Ethereum адрес: ошибка checksum.',
          'Совет: передай адрес целиком в lower-case, бот сам нормализует checksum.',
        ].join('\n'),
      );
    }

    this.logger.debug(`trackAddress normalizedAddress=${normalizedAddress}`);

    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const wallet = await this.trackedWalletsRepository.findOrCreate(
      ChainKey.ETHEREUM_MAINNET,
      normalizedAddress,
      label,
    );
    const insertedSubscription = await this.subscriptionsRepository.addSubscription(
      user.id,
      wallet.id,
    );

    if (!insertedSubscription) {
      this.logger.log(
        `trackAddress skipped duplicate telegramId=${userRef.telegramId} address=${normalizedAddress}`,
      );
      return [
        `Адрес уже отслеживается: #${wallet.id} ${normalizedAddress}.`,
        `История: /history #${wallet.id} ${TrackingService.DEFAULT_HISTORY_LIMIT}`,
      ].join('\n');
    }

    this.logger.log(
      `trackAddress success telegramId=${userRef.telegramId} walletId=${wallet.id} address=${normalizedAddress}`,
    );
    if (label) {
      return [
        `Добавил адрес #${wallet.id} ${normalizedAddress} (${label}).`,
        `История: /history #${wallet.id} ${TrackingService.DEFAULT_HISTORY_LIMIT}`,
        `Удалить: /untrack #${wallet.id}`,
      ].join('\n');
    }

    return [
      `Добавил адрес #${wallet.id} ${normalizedAddress}.`,
      `История: /history #${wallet.id} ${TrackingService.DEFAULT_HISTORY_LIMIT}`,
      `Удалить: /untrack #${wallet.id}`,
    ].join('\n');
  }

  public async listTrackedAddresses(userRef: TelegramUserRef): Promise<string> {
    this.logger.debug(`listTrackedAddresses start telegramId=${userRef.telegramId}`);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const subscriptions = await this.subscriptionsRepository.listByUserId(user.id);
    this.logger.debug(
      `listTrackedAddresses loaded telegramId=${userRef.telegramId} count=${subscriptions.length}`,
    );

    if (subscriptions.length === 0) {
      this.logger.log(`listTrackedAddresses empty telegramId=${userRef.telegramId}`);
      return ['Список отслеживания пуст.', 'Добавь первый адрес:', '/track <address> [label]'].join(
        '\n',
      );
    }

    const rows: string[] = subscriptions.map((subscription, index: number): string => {
      const walletId: number | null = this.normalizeDbId(subscription.walletId);
      const walletIdText: string =
        walletId !== null ? String(walletId) : String(subscription.walletId);
      const labelPart: string = subscription.walletLabel ? ` (${subscription.walletLabel})` : '';
      return [
        `${index + 1}. #${walletIdText}${labelPart}`,
        `   ${subscription.walletAddress}`,
        `   История: /history #${walletIdText} ${TrackingService.DEFAULT_HISTORY_LIMIT}`,
        `   Удалить: /untrack #${walletIdText}`,
      ].join('\n');
    });

    return [`Отслеживаемые адреса (${subscriptions.length}):`, ...rows].join('\n');
  }

  public async listTrackedWalletOptions(
    userRef: TelegramUserRef,
  ): Promise<readonly TrackedWalletOption[]> {
    this.logger.debug(`listTrackedWalletOptions start telegramId=${userRef.telegramId}`);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const subscriptions = await this.subscriptionsRepository.listByUserId(user.id);

    const options: TrackedWalletOption[] = [];

    for (const subscription of subscriptions) {
      const walletId: number | null = this.normalizeDbId(subscription.walletId);

      if (walletId === null) {
        this.logger.warn(
          `Skip wallet option with invalid walletId value=${String(subscription.walletId)} telegramId=${userRef.telegramId}`,
        );
        continue;
      }

      options.push({
        walletId,
        walletAddress: subscription.walletAddress,
        walletLabel: subscription.walletLabel,
      });
    }

    return options;
  }

  public async getWalletDetails(userRef: TelegramUserRef, rawWalletId: string): Promise<string> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletId: number | null = this.parseWalletId(rawWalletId);

    if (walletId === null) {
      throw new Error('Неверный id кошелька. Используй формат /wallet #3.');
    }

    const subscriptions = await this.subscriptionsRepository.listByUserId(user.id);
    const matchedSubscription = this.findSubscriptionByWalletId(subscriptions, walletId);

    if (!matchedSubscription) {
      throw new Error(`Не нашел адрес с id #${walletId}. Сначала проверь /list.`);
    }

    const labelText: string = matchedSubscription.walletLabel ?? 'без ярлыка';

    return [
      `Кошелек #${walletId}`,
      `Label: ${labelText}`,
      `Address: ${matchedSubscription.walletAddress}`,
      `История: /history #${walletId} 10`,
      `Фильтры: /walletfilters #${walletId}`,
      `Удалить: /untrack #${walletId}`,
    ].join('\n');
  }

  public async untrackAddress(userRef: TelegramUserRef, rawIdentifier: string): Promise<string> {
    this.logger.debug(
      `untrackAddress start telegramId=${userRef.telegramId} identifier=${rawIdentifier}`,
    );
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);

    const walletId: number | null = this.parseWalletId(rawIdentifier);

    if (walletId !== null) {
      const removedById: boolean = await this.subscriptionsRepository.removeByWalletId(
        user.id,
        walletId,
      );
      this.logger.log(
        `untrackAddress byId telegramId=${userRef.telegramId} walletId=${walletId} removed=${String(removedById)}`,
      );
      return removedById
        ? `Удалил адрес с id #${walletId} из отслеживания.`
        : `Не нашел подписку с id #${walletId}. Проверь список через /list.`;
    }

    const normalizedAddress: string | null = tryNormalizeEthereumAddress(rawIdentifier);

    if (!normalizedAddress) {
      this.logger.warn(
        `untrackAddress invalid identifier telegramId=${userRef.telegramId} identifier=${rawIdentifier}`,
      );
      throw new Error(
        [
          'Неверный идентификатор.',
          'Передай id из /list или Ethereum адрес.',
          'Примеры: /untrack #3 или /untrack 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        ].join('\n'),
      );
    }

    const removedByAddress: boolean = await this.subscriptionsRepository.removeByAddress(
      user.id,
      ChainKey.ETHEREUM_MAINNET,
      normalizedAddress,
    );
    this.logger.log(
      `untrackAddress byAddress telegramId=${userRef.telegramId} address=${normalizedAddress} removed=${String(removedByAddress)}`,
    );

    return removedByAddress
      ? `Удалил адрес ${normalizedAddress} из отслеживания.`
      : `Адрес ${normalizedAddress} не найден в списке. Проверь /list.`;
  }

  public async getUserAlertFilters(userRef: TelegramUserRef): Promise<string> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const preferencesRow: UserAlertPreferenceRow =
      await this.userAlertPreferencesRepository.findOrCreateByUserId(user.id);
    const preferences: UserAlertPreferences = this.mapPreferences(preferencesRow);
    const mutedUntilText: string = preferences.mutedUntil
      ? this.formatTimestamp(preferences.mutedUntil)
      : 'выключен';

    return [
      'Текущие фильтры алертов:',
      `- min amount: ${preferences.minAmount.toFixed(6)}`,
      `- transfer: ${preferences.allowTransfer ? 'on' : 'off'}`,
      `- swap: ${preferences.allowSwap ? 'on' : 'off'}`,
      `- mute до: ${mutedUntilText}`,
      '',
      'Команды:',
      '/setmin <amount>',
      '/mute <minutes|off>',
      '/filters transfer <on|off>',
      '/filters swap <on|off>',
    ].join('\n');
  }

  public async setMinimumAlertAmount(userRef: TelegramUserRef, rawAmount: string): Promise<string> {
    const minAmount: number = this.parseMinAmount(rawAmount);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedRow: UserAlertPreferenceRow =
      await this.userAlertPreferencesRepository.updateMinAmount(user.id, minAmount);
    const preferences: UserAlertPreferences = this.mapPreferences(updatedRow);

    return `Установил минимальную сумму алерта: ${preferences.minAmount.toFixed(6)}.`;
  }

  public async setMuteAlerts(userRef: TelegramUserRef, rawMinutes: string): Promise<string> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const mutedUntil: Date | null = this.parseMuteUntil(rawMinutes);
    const updatedRow: UserAlertPreferenceRow = await this.userAlertPreferencesRepository.updateMute(
      user.id,
      mutedUntil,
    );
    const preferences: UserAlertPreferences = this.mapPreferences(updatedRow);

    if (!preferences.mutedUntil) {
      return 'Mute выключен. Алерты снова активны.';
    }

    return `Алерты отключены до ${this.formatTimestamp(preferences.mutedUntil)}.`;
  }

  public async setEventTypeFilter(
    userRef: TelegramUserRef,
    target: AlertFilterToggleTarget,
    enabled: boolean,
  ): Promise<string> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const targetType: AlertEventFilterType = this.mapAlertFilterTarget(target);
    await this.userAlertPreferencesRepository.updateEventType(user.id, targetType, enabled);

    return `Фильтр ${target} -> ${enabled ? 'on' : 'off'}.`;
  }

  public async getWalletAlertFilterState(
    userRef: TelegramUserRef,
    rawWalletId: string,
  ): Promise<WalletAlertFilterState> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.resolveWalletSubscription(user.id, rawWalletId);
    const globalPreferences: UserAlertPreferenceRow =
      await this.userAlertPreferencesRepository.findOrCreateByUserId(user.id);
    const walletPreferences: UserWalletAlertPreferenceRow | null =
      await this.userWalletAlertPreferencesRepository.findByUserAndWalletId(
        user.id,
        walletSubscription.walletId,
      );

    return {
      walletId: walletSubscription.walletId,
      walletAddress: walletSubscription.walletAddress,
      walletLabel: walletSubscription.walletLabel,
      allowTransfer: walletPreferences
        ? walletPreferences.allow_transfer
        : globalPreferences.allow_transfer,
      allowSwap: walletPreferences ? walletPreferences.allow_swap : globalPreferences.allow_swap,
      hasWalletOverride: walletPreferences !== null,
    };
  }

  public async setWalletEventTypeFilter(
    userRef: TelegramUserRef,
    rawWalletId: string,
    target: AlertFilterToggleTarget,
    enabled: boolean,
  ): Promise<WalletAlertFilterState> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.resolveWalletSubscription(user.id, rawWalletId);
    const targetType: AlertEventFilterType = this.mapAlertFilterTarget(target);

    await this.userWalletAlertPreferencesRepository.updateEventType(
      user.id,
      walletSubscription.walletId,
      targetType,
      enabled,
    );

    return this.getWalletAlertFilterState(userRef, `#${String(walletSubscription.walletId)}`);
  }

  public async getUserStatus(userRef: TelegramUserRef): Promise<string> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const preferencesRow: UserAlertPreferenceRow =
      await this.userAlertPreferencesRepository.findOrCreateByUserId(user.id);
    const preferences: UserAlertPreferences = this.mapPreferences(preferencesRow);
    const historyQuota: HistoryQuotaSnapshot = this.historyRateLimiterService.getSnapshot(
      userRef.telegramId,
    );

    return [
      'Пользовательский статус:',
      `- min amount: ${preferences.minAmount.toFixed(6)}`,
      `- transfer: ${preferences.allowTransfer ? 'on' : 'off'}`,
      `- swap: ${preferences.allowSwap ? 'on' : 'off'}`,
      `- mute до: ${preferences.mutedUntil ? this.formatTimestamp(preferences.mutedUntil) : 'выключен'}`,
      `- history quota: ${historyQuota.minuteUsed}/${historyQuota.minuteLimit} (remaining ${historyQuota.minuteRemaining})`,
      `- history callback cooldown retry: ${historyQuota.callbackRetryAfterSec} sec`,
    ].join('\n');
  }

  public async getAddressHistory(
    userRef: TelegramUserRef,
    rawAddress: string,
    rawLimit: string | null,
    rawKind: string | null = null,
    rawDirection: string | null = null,
  ): Promise<string> {
    return this.getAddressHistoryWithPolicy(
      userRef,
      rawAddress,
      rawLimit,
      HistoryRequestSource.COMMAND,
      rawKind,
      rawDirection,
    );
  }

  public async getAddressHistoryPageWithPolicy(
    userRef: TelegramUserRef,
    rawAddress: string,
    rawLimit: string | null,
    rawOffset: string | null,
    source: HistoryRequestSource,
    rawKind: string | null = null,
    rawDirection: string | null = null,
  ): Promise<HistoryPageResult> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const historyTarget = await this.resolveHistoryTarget(user.id, rawAddress);
    const limit: number = this.parseHistoryLimit(rawLimit);
    const offset: number = this.parseHistoryOffset(rawOffset);
    const historyKind: HistoryKind = this.parseHistoryKind(rawKind);
    const historyDirection: HistoryDirectionFilter = this.parseHistoryDirection(rawDirection);

    if (offset === 0) {
      const message: string = await this.getAddressHistoryWithPolicy(
        userRef,
        rawAddress,
        String(limit),
        source,
        rawKind,
        rawDirection,
      );
      const localEventsWithFilters: readonly WalletEventHistoryView[] =
        await this.loadLocalEventsForHistory(
          historyTarget.address,
          limit + 1,
          0,
          historyKind,
          historyDirection,
        );

      return {
        message,
        resolvedAddress: historyTarget.address,
        walletId: historyTarget.walletId,
        limit,
        offset: 0,
        kind: historyKind,
        direction: historyDirection,
        hasNextPage: localEventsWithFilters.length > limit,
      };
    }

    const rateLimitDecision: HistoryRateLimitDecision = this.historyRateLimiterService.evaluate(
      userRef.telegramId,
      source,
    );

    if (!rateLimitDecision.allowed) {
      throw new Error(this.buildHistoryRetryMessage(rateLimitDecision));
    }

    const localEventsWithProbe: readonly WalletEventHistoryView[] =
      await this.loadLocalEventsForHistory(
        historyTarget.address,
        limit + 1,
        offset,
        historyKind,
        historyDirection,
      );

    if (localEventsWithProbe.length === 0) {
      throw new Error('Нет дополнительных локальных событий. Нажми «Обновить».');
    }

    const pageEvents: readonly WalletEventHistoryView[] = localEventsWithProbe.slice(0, limit);
    const message: string = this.formatWalletEventsHistoryMessage(
      historyTarget.address,
      pageEvents,
      offset,
      historyKind,
      historyDirection,
    );

    return {
      message,
      resolvedAddress: historyTarget.address,
      walletId: historyTarget.walletId,
      limit,
      offset,
      kind: historyKind,
      direction: historyDirection,
      hasNextPage: localEventsWithProbe.length > limit,
    };
  }

  public async getAddressHistoryWithPolicy(
    userRef: TelegramUserRef,
    rawAddress: string,
    rawLimit: string | null,
    source: HistoryRequestSource,
    rawKind: string | null = null,
    rawDirection: string | null = null,
  ): Promise<string> {
    this.logger.debug(
      `getAddressHistoryWithPolicy start telegramId=${userRef.telegramId} source=${source} rawAddress=${rawAddress} rawLimit=${rawLimit ?? 'n/a'}`,
    );

    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const historyTarget = await this.resolveHistoryTarget(user.id, rawAddress);
    const normalizedAddress: string = historyTarget.address;
    const limit: number = this.parseHistoryLimit(rawLimit);
    const historyKind: HistoryKind = this.parseHistoryKind(rawKind);
    const historyDirection: HistoryDirectionFilter = this.parseHistoryDirection(rawDirection);
    const rateLimitDecision: HistoryRateLimitDecision = this.historyRateLimiterService.evaluate(
      userRef.telegramId,
      source,
    );

    if (!rateLimitDecision.allowed) {
      this.logger.warn(
        `history_rate_limited telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} reason=${rateLimitDecision.reason} retryAfterSec=${String(rateLimitDecision.retryAfterSec ?? 0)}`,
      );

      const staleEntry: HistoryCacheEntry | null = this.historyCacheService.getStale(
        normalizedAddress,
        limit,
        historyKind,
        historyDirection,
      );

      if (staleEntry) {
        this.logger.warn(
          `history_stale_served telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} reason=local_rate_limit`,
        );
        return this.buildStaleMessage(staleEntry.message);
      }

      throw new Error(this.buildHistoryRetryMessage(rateLimitDecision));
    }

    const freshEntry: HistoryCacheEntry | null = this.historyCacheService.getFresh(
      normalizedAddress,
      limit,
      historyKind,
      historyDirection,
    );

    if (freshEntry) {
      this.logger.debug(
        `history_cache_hit telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)}`,
      );
      return freshEntry.message;
    }

    this.logger.debug(
      `history_cache_miss telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)}`,
    );

    try {
      const localEvents: readonly WalletEventHistoryView[] = await this.loadLocalEventsForHistory(
        normalizedAddress,
        limit,
        0,
        historyKind,
        historyDirection,
      );

      if (localEvents.length > 0) {
        this.logger.debug(
          `history_local_hit telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} count=${localEvents.length}`,
        );
        const localHistoryMessage: string = this.formatWalletEventsHistoryMessage(
          normalizedAddress,
          localEvents,
          0,
          historyKind,
          historyDirection,
        );
        this.historyCacheService.set(
          normalizedAddress,
          limit,
          localHistoryMessage,
          historyKind,
          historyDirection,
        );
        return localHistoryMessage;
      }

      this.logger.debug(
        `history_local_miss telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)}`,
      );
      const historyPage: HistoryPageDto = await this.historyExplorerAdapter.loadRecentTransactions({
        chainKey: ChainKey.ETHEREUM_MAINNET,
        address: normalizedAddress,
        limit,
        offset: 0,
        kind: historyKind,
        direction: historyDirection,
      });
      const historyMessage: string = this.formatHistoryMessage(
        normalizedAddress,
        historyPage.items,
      );
      this.historyCacheService.set(
        normalizedAddress,
        limit,
        historyMessage,
        historyKind,
        historyDirection,
      );
      return historyMessage;
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `history_fetch_failed telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} reason=${errorMessage}`,
      );

      if (!this.isRateLimitOrTimeout(errorMessage)) {
        throw error;
      }

      const staleEntry: HistoryCacheEntry | null = this.historyCacheService.getStale(
        normalizedAddress,
        limit,
        historyKind,
        historyDirection,
      );

      if (staleEntry) {
        this.logger.warn(
          `history_stale_served telegramId=${userRef.telegramId} source=${source} address=${normalizedAddress} limit=${String(limit)} reason=external_rate_limit`,
        );
        return this.buildStaleMessage(staleEntry.message);
      }

      throw new Error(this.buildHistoryRetryMessage(rateLimitDecision));
    }
  }

  private parseWalletId(rawIdentifier: string): number | null {
    const normalizedIdentifier: string = rawIdentifier.trim().replace('#', '');

    if (!/^\d+$/.test(normalizedIdentifier)) {
      return null;
    }

    return Number.parseInt(normalizedIdentifier, 10);
  }

  private async resolveWalletSubscription(
    userId: number,
    rawWalletId: string,
  ): Promise<{
    readonly walletId: number;
    readonly walletAddress: string;
    readonly walletLabel: string | null;
  }> {
    const walletId: number | null = this.parseWalletId(rawWalletId);

    if (walletId === null) {
      throw new Error('Неверный id кошелька. Используй формат #3.');
    }

    const subscriptions = await this.subscriptionsRepository.listByUserId(userId);
    const matchedSubscription = this.findSubscriptionByWalletId(subscriptions, walletId);

    if (!matchedSubscription) {
      throw new Error(`Не нашел адрес с id #${walletId}. Сначала проверь /list.`);
    }

    return matchedSubscription;
  }

  private async resolveHistoryTarget(
    userId: number,
    rawAddress: string,
  ): Promise<{
    readonly address: string;
    readonly walletId: number | null;
  }> {
    const walletId: number | null = this.parseWalletId(rawAddress);

    if (walletId !== null) {
      const subscriptions = await this.subscriptionsRepository.listByUserId(userId);
      const matchedSubscription = this.findSubscriptionByWalletId(subscriptions, walletId);

      if (!matchedSubscription) {
        throw new Error(`Не нашел адрес с id #${walletId}. Сначала проверь /list.`);
      }

      return {
        address: matchedSubscription.walletAddress,
        walletId,
      };
    }

    if (!isEthereumAddressCandidate(rawAddress)) {
      throw new Error(
        [
          'Неверный Ethereum адрес.',
          'Ожидаю формат 0x + 40 hex-символов.',
          'Можно передать id из /list: /history #3 10',
        ].join('\n'),
      );
    }

    const normalizedAddress: string | null = tryNormalizeEthereumAddress(rawAddress);

    if (!normalizedAddress) {
      throw new Error(
        [
          'Неверный Ethereum адрес: ошибка checksum.',
          'Совет: передай адрес целиком в lower-case, бот сам нормализует checksum.',
        ].join('\n'),
      );
    }

    return {
      address: normalizedAddress,
      walletId: null,
    };
  }

  private parseHistoryLimit(rawLimit: string | null): number {
    if (!rawLimit) {
      return TrackingService.DEFAULT_HISTORY_LIMIT;
    }

    const normalizedValue: string = rawLimit.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      throw new Error(
        `Неверный limit "${rawLimit}". Используй число от 1 до ${TrackingService.MAX_HISTORY_LIMIT}.`,
      );
    }

    const limit: number = Number.parseInt(normalizedValue, 10);

    if (limit < 1 || limit > TrackingService.MAX_HISTORY_LIMIT) {
      throw new Error(
        `Неверный limit "${rawLimit}". Используй число от 1 до ${TrackingService.MAX_HISTORY_LIMIT}.`,
      );
    }

    return limit;
  }

  private parseHistoryOffset(rawOffset: string | null): number {
    if (!rawOffset) {
      return 0;
    }

    const normalizedValue: string = rawOffset.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      throw new Error(`Неверный offset "${rawOffset}". Используй целое число >= 0.`);
    }

    const offset: number = Number.parseInt(normalizedValue, 10);

    if (offset < 0 || offset > 10_000) {
      throw new Error(`Неверный offset "${rawOffset}". Используй значение от 0 до 10000.`);
    }

    return offset;
  }

  private parseHistoryKind(rawKind: string | null): HistoryKind {
    if (!rawKind) {
      return HistoryKind.ALL;
    }

    const normalizedKind: string = rawKind.trim().toLowerCase();

    if (normalizedKind === 'all') {
      return HistoryKind.ALL;
    }

    if (normalizedKind === 'eth') {
      return HistoryKind.ETH;
    }

    if (normalizedKind === 'erc20') {
      return HistoryKind.ERC20;
    }

    throw new Error('Неверный kind. Используй all|eth|erc20.');
  }

  private parseHistoryDirection(rawDirection: string | null): HistoryDirectionFilter {
    if (!rawDirection) {
      return HistoryDirectionFilter.ALL;
    }

    const normalizedDirection: string = rawDirection.trim().toLowerCase();

    if (normalizedDirection === 'all') {
      return HistoryDirectionFilter.ALL;
    }

    if (normalizedDirection === 'in') {
      return HistoryDirectionFilter.IN;
    }

    if (normalizedDirection === 'out') {
      return HistoryDirectionFilter.OUT;
    }

    throw new Error('Неверный direction. Используй all|in|out.');
  }

  private async loadLocalEventsForHistory(
    normalizedAddress: string,
    limit: number,
    offset: number,
    historyKind: HistoryKind,
    historyDirection: HistoryDirectionFilter,
  ): Promise<readonly WalletEventHistoryView[]> {
    const rawFetchLimit: number = Math.min(Math.max(offset + limit + 50, limit), 200);
    const rawEvents: readonly WalletEventHistoryView[] =
      await this.walletEventsRepository.listRecentByTrackedAddress(
        ChainKey.ETHEREUM_MAINNET,
        normalizedAddress,
        rawFetchLimit,
        0,
      );

    const filteredEvents: readonly WalletEventHistoryView[] = this.filterWalletEventsForHistory(
      rawEvents,
      historyKind,
      historyDirection,
    );

    if (offset <= 0) {
      return filteredEvents.slice(0, limit);
    }

    return filteredEvents.slice(offset, offset + limit + 1);
  }

  private filterWalletEventsForHistory(
    events: readonly WalletEventHistoryView[],
    historyKind: HistoryKind,
    historyDirection: HistoryDirectionFilter,
  ): readonly WalletEventHistoryView[] {
    return events.filter((event: WalletEventHistoryView): boolean => {
      if (historyDirection === HistoryDirectionFilter.IN && event.direction !== 'IN') {
        return false;
      }

      if (historyDirection === HistoryDirectionFilter.OUT && event.direction !== 'OUT') {
        return false;
      }

      if (historyKind === HistoryKind.ETH) {
        return event.tokenAddress === null || event.tokenSymbol === 'ETH';
      }

      if (historyKind === HistoryKind.ERC20) {
        return event.tokenAddress !== null && event.tokenSymbol !== 'ETH';
      }

      return true;
    });
  }

  private mapPreferences(row: UserAlertPreferenceRow): UserAlertPreferences {
    const minAmount: number = Number.parseFloat(String(row.min_amount));

    return {
      minAmount: Number.isNaN(minAmount) ? 0 : minAmount,
      allowTransfer: row.allow_transfer,
      allowSwap: row.allow_swap,
      mutedUntil: row.muted_until,
    };
  }

  private parseMinAmount(rawAmount: string): number {
    const normalizedAmount: string = rawAmount.trim();

    if (!/^\d+(\.\d+)?$/.test(normalizedAmount)) {
      throw new Error('Неверный формат суммы. Пример: /setmin 1000 или /setmin 12.5');
    }

    const parsedAmount: number = Number.parseFloat(normalizedAmount);

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      throw new Error('Минимальная сумма должна быть неотрицательным числом.');
    }

    return parsedAmount;
  }

  private parseMuteUntil(rawMinutes: string): Date | null {
    const normalizedMinutes: string = rawMinutes.trim().toLowerCase();

    if (normalizedMinutes === 'off' || normalizedMinutes === '0') {
      return null;
    }

    if (!/^\d+$/.test(normalizedMinutes)) {
      throw new Error('Неверный формат mute. Используй /mute <minutes|off>.');
    }

    const minutes: number = Number.parseInt(normalizedMinutes, 10);

    if (minutes < 0 || minutes > 10_080) {
      throw new Error('mute должен быть от 0 до 10080 минут.');
    }

    if (minutes === 0) {
      return null;
    }

    const now: Date = new Date();
    return new Date(now.getTime() + minutes * 60_000);
  }

  private formatHistoryMessage(
    normalizedAddress: string,
    transactions: readonly HistoryItemDto[],
  ): string {
    if (transactions.length === 0) {
      return `История для ${normalizedAddress} пуста.`;
    }

    const rows: string[] = transactions.map((tx, index: number): string => {
      const direction: string = tx.direction;
      const date: Date = new Date(tx.timestampSec * 1000);
      const formattedValue: string = this.formatAssetValue(tx.valueRaw, tx.assetDecimals);
      const statusIcon: string = tx.isError ? '🔴' : '🟢';
      const directionIcon: string = direction === 'OUT' ? '↗️ OUT' : '↘️ IN';
      const escapedAssetSymbol: string = this.escapeHtml(tx.assetSymbol);
      const txUrl: string = this.buildTxUrl(tx.txHash);
      const eventType: string = this.escapeHtml(tx.eventType);

      return [
        `<a href="${txUrl}">Tx #${index + 1}</a> ${statusIcon} ${directionIcon} <b>${formattedValue} ${escapedAssetSymbol}</b>`,
        `📌 <code>${eventType}</code>`,
        `🕒 <code>${this.formatTimestamp(date)}</code>`,
        `🔹 <code>${this.shortHash(tx.txHash)}</code>`,
      ].join('\n');
    });

    return [
      `📜 <b>История</b> <code>${normalizedAddress}</code>`,
      `Последние ${transactions.length} tx:`,
      ...rows,
    ].join('\n\n');
  }

  private formatWalletEventsHistoryMessage(
    normalizedAddress: string,
    events: readonly WalletEventHistoryView[],
    offset: number = 0,
    historyKind: HistoryKind = HistoryKind.ALL,
    historyDirection: HistoryDirectionFilter = HistoryDirectionFilter.ALL,
  ): string {
    const rows: string[] = events.map((event, index: number): string => {
      const txUrl: string = this.buildTxUrl(event.txHash);
      const formattedValue: string = this.resolveEventValue(event);
      const directionLabel: string = this.resolveDirectionLabel(event.direction);
      const eventTypeLabel: string = this.escapeHtml(event.eventType);
      const contractShort: string =
        event.contractAddress !== null ? this.shortHash(event.contractAddress) : 'n/a';

      return [
        `<a href="${txUrl}">Tx #${index + 1}</a> ${directionLabel} <b>${this.escapeHtml(formattedValue)}</b>`,
        `📌 <code>${eventTypeLabel}</code> • <code>${contractShort}</code>`,
        `🕒 <code>${this.formatTimestamp(event.occurredAt)}</code>`,
      ].join('\n');
    });

    const startIndex: number = offset + 1;
    const endIndex: number = offset + events.length;

    return [
      `📜 <b>История</b> <code>${normalizedAddress}</code>`,
      `Фильтр: kind=<code>${historyKind}</code>, direction=<code>${historyDirection}</code>`,
      `Локальные события ${startIndex}-${endIndex}:`,
      ...rows,
    ].join('\n\n');
  }

  private buildStaleMessage(cachedHistoryMessage: string): string {
    return [
      '⚠️ Показал кешированную историю (данные могут быть неактуальны).',
      cachedHistoryMessage,
    ].join('\n\n');
  }

  private buildHistoryRetryMessage(decision: HistoryRateLimitDecision): string {
    const retryAfterSec: number = decision.retryAfterSec ?? 1;

    if (decision.reason === HistoryRateLimitReason.CALLBACK_COOLDOWN) {
      return `Слишком часто нажимаешь кнопку истории. Повтори через ${String(retryAfterSec)} сек.`;
    }

    return `Слишком много запросов к истории. Повтори через ${String(retryAfterSec)} сек.`;
  }

  private isRateLimitOrTimeout(errorMessage: string): boolean {
    const normalizedMessage: string = errorMessage.toLowerCase();

    return (
      normalizedMessage.includes('rate limit') ||
      normalizedMessage.includes('http 429') ||
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('aborted') ||
      normalizedMessage.includes('too many requests')
    );
  }

  private formatAssetValue(valueRaw: string, decimals: number): string {
    try {
      const formatted: string = formatUnits(BigInt(valueRaw), decimals);
      return Number.parseFloat(formatted).toFixed(6);
    } catch {
      return '0.000000';
    }
  }

  private resolveDirectionLabel(direction: string): string {
    if (direction === 'OUT') {
      return '↗️ OUT';
    }

    if (direction === 'IN') {
      return '↘️ IN';
    }

    return '↔️ UNKNOWN';
  }

  private resolveEventValue(event: WalletEventHistoryView): string {
    if (event.valueFormatted !== null && event.valueFormatted.trim().length > 0) {
      const symbolFromValue: string = event.tokenSymbol ?? 'TOKEN';
      return `${event.valueFormatted} ${symbolFromValue}`;
    }

    if (event.tokenAmountRaw !== null && event.tokenDecimals !== null && event.tokenDecimals >= 0) {
      const normalizedAmount: string = this.formatAssetValue(
        event.tokenAmountRaw,
        event.tokenDecimals,
      );
      const symbolFromAmount: string = event.tokenSymbol ?? 'TOKEN';
      return `${normalizedAmount} ${symbolFromAmount}`;
    }

    if (event.tokenSymbol !== null && event.tokenSymbol.trim().length > 0) {
      return event.tokenSymbol;
    }

    return event.eventType;
  }

  private formatTimestamp(date: Date): string {
    const isoTimestamp: string = date.toISOString();
    return isoTimestamp.replace('T', ' ').replace('.000Z', ' UTC');
  }

  private buildTxUrl(txHash: string): string {
    return `${this.appConfigService.etherscanTxBaseUrl}${txHash}`;
  }

  private shortHash(txHash: string): string {
    const prefix: string = txHash.slice(0, 10);
    const suffix: string = txHash.slice(-8);
    return `${prefix}...${suffix}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private findSubscriptionByWalletId(
    subscriptions: readonly {
      readonly walletId: number;
      readonly walletAddress: string;
      readonly walletLabel: string | null;
    }[],
    targetWalletId: number,
  ): {
    readonly walletId: number;
    readonly walletAddress: string;
    readonly walletLabel: string | null;
  } | null {
    for (const subscription of subscriptions) {
      const subscriptionWalletId: number | null = this.normalizeDbId(subscription.walletId);

      if (subscriptionWalletId === targetWalletId) {
        return subscription;
      }
    }

    return null;
  }

  private normalizeDbId(rawValue: unknown): number | null {
    if (typeof rawValue === 'number' && Number.isSafeInteger(rawValue) && rawValue > 0) {
      return rawValue;
    }

    if (typeof rawValue !== 'string') {
      return null;
    }

    const trimmed: string = rawValue.trim();

    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed: number = Number.parseInt(trimmed, 10);

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private mapAlertFilterTarget(target: AlertFilterToggleTarget): AlertEventFilterType {
    return target === AlertFilterToggleTarget.TRANSFER
      ? AlertEventFilterType.TRANSFER
      : AlertEventFilterType.SWAP;
  }
}
