import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatUnits } from 'ethers';

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
  type UserAlertSettingsSnapshot,
  type WalletAlertFilterState,
} from './tracking.interfaces';
import { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import type { IAddressCodecRegistry } from '../core/ports/address/address-codec-registry.interfaces';
import { ADDRESS_CODEC_REGISTRY } from '../core/ports/address/address-port.tokens';
import { HISTORY_EXPLORER_ADAPTER } from '../core/ports/explorers/explorer-port.tokens';
import type { IHistoryExplorerAdapter } from '../core/ports/explorers/history-explorer.interfaces';
import { AlertCexFlowMode } from '../features/alerts/cex-flow.interfaces';
import { normalizeDexKey } from '../features/alerts/dex-normalizer.util';
import { AlertSmartFilterType } from '../features/alerts/smart-filter.interfaces';
import type { IHistoryItemDto, IHistoryPageDto } from '../features/tracking/dto/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';
import type {
  AlertMuteRow,
  UserAlertPreferenceRow,
  UserAlertSettingsRow,
  UserWalletAlertPreferenceRow,
} from '../storage/database.types';
import { AlertMutesRepository } from '../storage/repositories/alert-mutes.repository';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import { TrackedWalletsRepository } from '../storage/repositories/tracked-wallets.repository';
import { AlertEventFilterType } from '../storage/repositories/user-alert-preferences.interfaces';
import { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import { UserAlertSettingsRepository } from '../storage/repositories/user-alert-settings.repository';
import { UserWalletAlertPreferencesRepository } from '../storage/repositories/user-wallet-alert-preferences.repository';
import { UsersRepository } from '../storage/repositories/users.repository';
import { WalletEventsRepository } from '../storage/repositories/wallet-events.repository';
import type { WalletEventHistoryView } from '../storage/repositories/wallet-events.repository.interfaces';

const DEFAULT_HISTORY_LIMIT = 5;
const MAX_HISTORY_LIMIT = 20;
const WALLET_CARD_RECENT_EVENTS_LIMIT = 3;
const MINUTES_TO_MS = 60_000;
const MAX_HISTORY_OFFSET = 10_000;
const LOCAL_EVENTS_BUFFER = 50;
const LOCAL_EVENTS_MAX_FETCH = 200;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const ASSET_VALUE_PRECISION = 6;
const SHORT_HASH_PREFIX_LENGTH = 10;
const SHORT_HASH_SUFFIX_OFFSET = -8;

@Injectable()
export class TrackingService {
  private readonly logger: Logger = new Logger(TrackingService.name);
  private static readonly SUPPORTED_TRACK_CHAINS: readonly ChainKey[] = [
    ChainKey.ETHEREUM_MAINNET,
    ChainKey.SOLANA_MAINNET,
    ChainKey.TRON_MAINNET,
  ];

  public constructor(
    private readonly usersRepository: UsersRepository,
    private readonly trackedWalletsRepository: TrackedWalletsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    @Inject(ADDRESS_CODEC_REGISTRY)
    private readonly addressCodecRegistry: IAddressCodecRegistry,
    @Inject(HISTORY_EXPLORER_ADAPTER)
    private readonly historyExplorerAdapter: IHistoryExplorerAdapter,
    private readonly historyCacheService: HistoryCacheService,
    private readonly historyRateLimiterService: HistoryRateLimiterService,
    private readonly userAlertPreferencesRepository: UserAlertPreferencesRepository,
    private readonly userAlertSettingsRepository: UserAlertSettingsRepository,
    private readonly userWalletAlertPreferencesRepository: UserWalletAlertPreferencesRepository,
    private readonly alertMutesRepository: AlertMutesRepository,
    private readonly walletEventsRepository: WalletEventsRepository,
    private readonly appConfigService: AppConfigService,
  ) {}

  public async trackAddress(
    userRef: TelegramUserRef,
    rawAddress: string,
    label: string | null,
    chainKey: ChainKey = ChainKey.ETHEREUM_MAINNET,
  ): Promise<string> {
    this.logger.debug(
      `trackAddress start telegramId=${userRef.telegramId} chainKey=${chainKey} rawAddress=${rawAddress} label=${label ?? 'n/a'}`,
    );
    const addressCodec = this.addressCodecRegistry.getCodec(chainKey);

    if (!addressCodec.validate(rawAddress)) {
      this.logger.warn(
        `trackAddress invalid format telegramId=${userRef.telegramId} chainKey=${chainKey} rawAddress=${rawAddress}`,
      );
      throw new Error(this.buildInvalidAddressFormatMessage(chainKey));
    }

    const normalizedAddress: string | null = addressCodec.normalize(rawAddress);

    if (!normalizedAddress) {
      this.logger.warn(
        `trackAddress invalid checksum telegramId=${userRef.telegramId} chainKey=${chainKey} rawAddress=${rawAddress}`,
      );
      throw new Error(this.buildInvalidAddressNormalizationMessage(chainKey));
    }

    this.logger.debug(`trackAddress normalizedAddress=${normalizedAddress}`);

    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const wallet = await this.trackedWalletsRepository.findOrCreate(
      chainKey,
      normalizedAddress,
      label,
    );
    const insertedSubscription = await this.subscriptionsRepository.addSubscription(
      user.id,
      wallet.id,
    );

    if (!insertedSubscription) {
      this.logger.log(
        `trackAddress skipped duplicate telegramId=${userRef.telegramId} chainKey=${chainKey} address=${normalizedAddress}`,
      );
      return [
        `Адрес уже отслеживается: #${wallet.id} [${chainKey}] ${normalizedAddress}.`,
        `История: /history #${wallet.id} ${DEFAULT_HISTORY_LIMIT}`,
      ].join('\n');
    }

    this.logger.log(
      `trackAddress success telegramId=${userRef.telegramId} chainKey=${chainKey} walletId=${wallet.id} address=${normalizedAddress}`,
    );
    if (label) {
      return [
        `Добавил адрес #${wallet.id} [${chainKey}] ${normalizedAddress} (${label}).`,
        `История: /history #${wallet.id} ${DEFAULT_HISTORY_LIMIT}`,
        `Удалить: /untrack #${wallet.id}`,
      ].join('\n');
    }

    return [
      `Добавил адрес #${wallet.id} [${chainKey}] ${normalizedAddress}.`,
      `История: /history #${wallet.id} ${DEFAULT_HISTORY_LIMIT}`,
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
      return [
        'Список отслеживания пуст.',
        'Добавь первый адрес:',
        '/track <chain> <address> [label]',
      ].join('\n');
    }

    const rows: string[] = subscriptions.map((subscription, index: number): string => {
      const walletId: number | null = this.normalizeDbId(subscription.walletId);
      const walletIdText: string =
        walletId !== null ? String(walletId) : String(subscription.walletId);
      const labelPart: string = subscription.walletLabel ? ` (${subscription.walletLabel})` : '';
      return [
        `${index + 1}. #${walletIdText}${labelPart}`,
        `   ${subscription.walletAddress}`,
        `   История: /history #${walletIdText} ${DEFAULT_HISTORY_LIMIT}`,
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
    const [globalPreferences, settings, walletPreferences, activeMute, recentEvents] =
      await Promise.all([
        this.userAlertPreferencesRepository.findOrCreateByUserId(user.id),
        this.userAlertSettingsRepository.findOrCreateByUserAndChain(
          user.id,
          matchedSubscription.chainKey,
        ),
        this.userWalletAlertPreferencesRepository.findByUserAndWalletId(user.id, walletId),
        this.alertMutesRepository.findActiveMute(user.id, matchedSubscription.chainKey, walletId),
        this.walletEventsRepository.listRecentByTrackedAddress(
          matchedSubscription.chainKey,
          matchedSubscription.walletAddress,
          WALLET_CARD_RECENT_EVENTS_LIMIT,
          0,
        ),
      ]);
    const allowTransfer: boolean = walletPreferences
      ? walletPreferences.allow_transfer
      : globalPreferences.allow_transfer;
    const allowSwap: boolean = walletPreferences
      ? walletPreferences.allow_swap
      : globalPreferences.allow_swap;
    const filterSource: string = walletPreferences === null ? 'global' : 'wallet override';
    const recentEventRows: readonly string[] = this.formatWalletCardRecentEvents(recentEvents);
    const muteStatusText: string =
      activeMute === null ? 'off' : this.formatTimestamp(activeMute.mute_until);
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(settings);
    const quietText: string = this.formatQuietHours(settingsSnapshot);

    return [
      `💼 Кошелек #${walletId}`,
      `⛓ Сеть: ${matchedSubscription.chainKey}`,
      `🏷 Label: ${labelText}`,
      `📍 Address: ${matchedSubscription.walletAddress}`,
      `🔔 Фильтры: transfer=${allowTransfer ? 'on' : 'off'}, swap=${allowSwap ? 'on' : 'off'} (${filterSource})`,
      `💵 USD filter: >= ${settingsSnapshot.thresholdUsd.toFixed(2)}`,
      `🏦 CEX flow: ${settingsSnapshot.cexFlowMode}`,
      `🧠 Smart: type=${settingsSnapshot.smartFilterType}, include_dex=${this.formatDexFilter(settingsSnapshot.includeDexes)}, exclude_dex=${this.formatDexFilter(settingsSnapshot.excludeDexes)}`,
      `🌙 Quiet: ${quietText} (${settingsSnapshot.timezone})`,
      `🚫 Ignore 24h до: ${muteStatusText}`,
      '',
      `🧾 Последние события (${recentEvents.length}/${WALLET_CARD_RECENT_EVENTS_LIMIT}):`,
      ...recentEventRows,
      '',
      '👇 Действия доступны кнопками ниже.',
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

    const normalizedAddresses: readonly {
      readonly chainKey: ChainKey;
      readonly address: string;
    }[] = this.resolveNormalizedAddressCandidates(rawIdentifier);

    if (normalizedAddresses.length === 0) {
      this.logger.warn(
        `untrackAddress invalid identifier telegramId=${userRef.telegramId} identifier=${rawIdentifier}`,
      );
      throw new Error(
        [
          'Неверный идентификатор.',
          'Передай id из /list или адрес Ethereum/Solana.',
          'Примеры:',
          '/untrack #3',
          '/untrack 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          '/untrack 11111111111111111111111111111111',
        ].join('\n'),
      );
    }

    for (const normalizedAddress of normalizedAddresses) {
      const removedByAddress: boolean = await this.subscriptionsRepository.removeByAddress(
        user.id,
        normalizedAddress.chainKey,
        normalizedAddress.address,
      );
      this.logger.log(
        `untrackAddress byAddress telegramId=${userRef.telegramId} chainKey=${normalizedAddress.chainKey} address=${normalizedAddress.address} removed=${String(removedByAddress)}`,
      );

      if (removedByAddress) {
        return `Удалил адрес [${normalizedAddress.chainKey}] ${normalizedAddress.address} из отслеживания.`;
      }
    }

    const firstNormalizedAddress = normalizedAddresses[0];

    if (!firstNormalizedAddress) {
      throw new Error('Адрес не найден в списке. Проверь /list.');
    }

    const displayAddress: string = firstNormalizedAddress.address;
    return `Адрес ${displayAddress} не найден в списке. Проверь /list.`;
  }

  public async getUserAlertFilters(userRef: TelegramUserRef): Promise<string> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const [preferencesRow, settingsRow] = await Promise.all([
      this.userAlertPreferencesRepository.findOrCreateByUserId(user.id),
      this.userAlertSettingsRepository.findOrCreateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
      ),
    ]);
    const preferences: UserAlertPreferences = this.mapPreferences(preferencesRow);
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(settingsRow);
    const mutedUntilText: string = preferences.mutedUntil
      ? this.formatTimestamp(preferences.mutedUntil)
      : 'выключен';

    return [
      'Текущие фильтры алертов:',
      `- threshold usd: ${settingsSnapshot.thresholdUsd.toFixed(2)}`,
      '- /filter min_amount_usd: legacy alias -> /threshold',
      `- cex flow: ${settingsSnapshot.cexFlowMode}`,
      `- type: ${settingsSnapshot.smartFilterType}`,
      `- include dex: ${this.formatDexFilter(settingsSnapshot.includeDexes)}`,
      `- exclude dex: ${this.formatDexFilter(settingsSnapshot.excludeDexes)}`,
      `- transfer: ${preferences.allowTransfer ? 'on' : 'off'}`,
      `- swap: ${preferences.allowSwap ? 'on' : 'off'}`,
      `- mute до: ${mutedUntilText}`,
      `- quiet: ${this.formatQuietHours(settingsSnapshot)} (${settingsSnapshot.timezone})`,
      '',
      'Команды:',
      '/threshold <amount|off>',
      '/filter min_amount_usd <amount|off> (legacy alias)',
      '/filter cex <off|in|out|all>',
      '/filter type <all|buy|sell|transfer>',
      '/filter include_dex <dex|off>',
      '/filter exclude_dex <dex|off>',
      '/mute <minutes|off>',
      '/quiet <HH:mm-HH:mm|off>',
      '/tz <Area/City>',
      '/filters transfer <on|off>',
      '/filters swap <on|off>',
    ].join('\n');
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

  public async setThresholdUsd(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const thresholdUsd: number = this.parseUsdThresholdValue(rawValue);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          thresholdUsd,
          minAmountUsd: thresholdUsd,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(updatedSettings);

    return `Порог USD обновлен: ${settingsSnapshot.thresholdUsd.toFixed(2)}.`;
  }

  public async setMinAmountUsd(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const thresholdMessage: string = await this.setThresholdUsd(userRef, rawValue);
    return `${thresholdMessage}\nКоманда /filter min_amount_usd помечена как legacy alias для /threshold.`;
  }

  public async setCexFlowFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const cexFlowMode: AlertCexFlowMode = this.parseCexFlowMode(rawValue);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          cexFlowMode,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(updatedSettings);
    return `CEX flow фильтр обновлен: ${settingsSnapshot.cexFlowMode}.`;
  }

  public async setSmartFilterType(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const smartFilterType: AlertSmartFilterType = this.parseSmartFilterType(rawValue);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          smartFilterType,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(updatedSettings);
    return `Smart type обновлен: ${settingsSnapshot.smartFilterType}.`;
  }

  public async setIncludeDexFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const includeDexes: readonly string[] = this.parseDexFilterList(rawValue);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          includeDexes,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(updatedSettings);
    return `Include DEX фильтр обновлен: ${this.formatDexFilter(settingsSnapshot.includeDexes)}.`;
  }

  public async setExcludeDexFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const excludeDexes: readonly string[] = this.parseDexFilterList(rawValue);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          excludeDexes,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(updatedSettings);
    return `Exclude DEX фильтр обновлен: ${this.formatDexFilter(settingsSnapshot.excludeDexes)}.`;
  }

  public async setQuietHours(userRef: TelegramUserRef, rawWindow: string): Promise<string> {
    const quietWindow: {
      readonly quietFrom: string | null;
      readonly quietTo: string | null;
    } = this.parseQuietHours(rawWindow);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          quietFrom: quietWindow.quietFrom,
          quietTo: quietWindow.quietTo,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(updatedSettings);

    return `Quiet hours: ${this.formatQuietHours(settingsSnapshot)} (${settingsSnapshot.timezone}).`;
  }

  public async setUserTimezone(userRef: TelegramUserRef, rawTimezone: string): Promise<string> {
    const timezone: string = this.parseTimezone(rawTimezone);
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          timezone,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(updatedSettings);

    return `Таймзона обновлена: ${settingsSnapshot.timezone}.`;
  }

  public async muteWalletAlertsForDuration(
    userRef: TelegramUserRef,
    rawWalletId: string,
    muteMinutes: number,
    source: string,
  ): Promise<string> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.resolveWalletSubscription(user.id, rawWalletId);

    if (!Number.isSafeInteger(muteMinutes) || muteMinutes <= 0 || muteMinutes > 10_080) {
      throw new Error('mute для кошелька должен быть от 1 до 10080 минут.');
    }

    const muteUntil: Date = new Date(Date.now() + muteMinutes * MINUTES_TO_MS);
    const upsertedMute: AlertMuteRow = await this.alertMutesRepository.upsertMute({
      userId: user.id,
      chainKey: walletSubscription.chainKey,
      walletId: walletSubscription.walletId,
      muteUntil,
      source,
    });

    return [
      `Кошелек #${String(walletSubscription.walletId)} (${walletSubscription.walletLabel ?? 'без ярлыка'}) временно отключен.`,
      `До: ${this.formatTimestamp(upsertedMute.mute_until)}`,
    ].join('\n');
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
      chainKey: walletSubscription.chainKey,
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
    const [preferencesRow, settingsRow] = await Promise.all([
      this.userAlertPreferencesRepository.findOrCreateByUserId(user.id),
      this.userAlertSettingsRepository.findOrCreateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
      ),
    ]);
    const preferences: UserAlertPreferences = this.mapPreferences(preferencesRow);
    const settingsSnapshot: UserAlertSettingsSnapshot = this.mapSettings(settingsRow);
    const historyQuota: HistoryQuotaSnapshot = this.historyRateLimiterService.getSnapshot(
      userRef.telegramId,
    );

    return [
      'Пользовательский статус:',
      `- threshold usd: ${settingsSnapshot.thresholdUsd.toFixed(2)}`,
      '- /filter min_amount_usd: legacy alias -> /threshold',
      `- cex flow: ${settingsSnapshot.cexFlowMode}`,
      `- type: ${settingsSnapshot.smartFilterType}`,
      `- include dex: ${this.formatDexFilter(settingsSnapshot.includeDexes)}`,
      `- exclude dex: ${this.formatDexFilter(settingsSnapshot.excludeDexes)}`,
      `- transfer: ${preferences.allowTransfer ? 'on' : 'off'}`,
      `- swap: ${preferences.allowSwap ? 'on' : 'off'}`,
      `- mute до: ${preferences.mutedUntil ? this.formatTimestamp(preferences.mutedUntil) : 'выключен'}`,
      `- quiet: ${this.formatQuietHours(settingsSnapshot)} (${settingsSnapshot.timezone})`,
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
    this.assertHistoryChainIsSupported(historyTarget.chainKey);

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
          historyTarget.chainKey,
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
        historyTarget.chainKey,
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
      historyTarget.chainKey,
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
    this.assertHistoryChainIsSupported(historyTarget.chainKey);
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
        historyTarget.chainKey,
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
          historyTarget.chainKey,
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
      const historyPage: IHistoryPageDto = await this.historyExplorerAdapter.loadRecentTransactions(
        {
          chainKey: historyTarget.chainKey,
          address: normalizedAddress,
          limit,
          offset: 0,
          kind: historyKind,
          direction: historyDirection,
          minAmountUsd: null,
        },
      );
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

      throw new Error(
        'Внешний API временно ограничил доступ (429). Повтори через несколько секунд.',
      );
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
    readonly chainKey: ChainKey;
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
    readonly chainKey: ChainKey;
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
        chainKey: matchedSubscription.chainKey,
        address: matchedSubscription.walletAddress,
        walletId,
      };
    }

    const normalizedAddresses: readonly {
      readonly chainKey: ChainKey;
      readonly address: string;
    }[] = this.resolveNormalizedAddressCandidates(rawAddress);

    if (normalizedAddresses.length === 0) {
      throw new Error(
        [
          'Неверный адрес.',
          'Поддерживаются Ethereum, Solana и TRON адреса.',
          'Можно передать id из /list: /history #3 10',
        ].join('\n'),
      );
    }

    const firstCandidate = normalizedAddresses[0];

    if (!firstCandidate) {
      throw new Error(
        ['Неверный адрес.', 'Поддерживаются Ethereum, Solana и TRON адреса.'].join('\n'),
      );
    }

    return {
      chainKey: firstCandidate.chainKey,
      address: firstCandidate.address,
      walletId: null,
    };
  }

  private resolveNormalizedAddressCandidates(rawAddress: string): readonly {
    readonly chainKey: ChainKey;
    readonly address: string;
  }[] {
    const resolved: {
      chainKey: ChainKey;
      address: string;
    }[] = [];

    for (const chainKey of TrackingService.SUPPORTED_TRACK_CHAINS) {
      const codec = this.addressCodecRegistry.getCodec(chainKey);
      const normalizedAddress: string | null = codec.normalize(rawAddress);

      if (normalizedAddress) {
        resolved.push({
          chainKey,
          address: normalizedAddress,
        });
      }
    }

    return resolved;
  }

  private assertHistoryChainIsSupported(chainKey: ChainKey): void {
    const chainKeyValue: string = chainKey;
    const supportedHistoryChains: readonly string[] = [
      ChainKey.ETHEREUM_MAINNET,
      ChainKey.SOLANA_MAINNET,
      ChainKey.TRON_MAINNET,
    ];

    if (supportedHistoryChains.includes(chainKeyValue)) {
      return;
    }

    throw new Error(
      [
        `История для сети ${chainKeyValue} пока недоступна на этом этапе.`,
        'Сейчас поддерживаются /history для Ethereum, Solana и TRON.',
      ].join('\n'),
    );
  }

  private buildInvalidAddressFormatMessage(chainKey: ChainKey): string {
    if (chainKey === ChainKey.ETHEREUM_MAINNET) {
      return [
        'Неверный Ethereum адрес.',
        'Ожидаю формат 0x + 40 hex-символов.',
        'Пример: /track eth 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
      ].join('\n');
    }

    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return [
        'Неверный Solana адрес.',
        'Ожидаю base58 адрес длиной 32 байта.',
        'Пример: /track sol 11111111111111111111111111111111 test-wallet',
      ].join('\n');
    }

    return [
      'Неверный TRON адрес.',
      'Ожидаю base58 (T...) или hex формат (41.../0x...).',
      'Пример: /track tron TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 treasury',
    ].join('\n');
  }

  private buildInvalidAddressNormalizationMessage(chainKey: ChainKey): string {
    if (chainKey === ChainKey.ETHEREUM_MAINNET) {
      return [
        'Неверный Ethereum адрес: ошибка checksum.',
        'Совет: передай адрес целиком в lower-case, бот сам нормализует checksum.',
      ].join('\n');
    }

    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return ['Неверный Solana адрес.', 'Проверь символы base58 и корректность длины.'].join('\n');
    }

    return [
      'Не удалось нормализовать TRON адрес.',
      'Проверь base58 checksum или hex-представление адреса.',
    ].join('\n');
  }

  private parseHistoryLimit(rawLimit: string | null): number {
    if (!rawLimit) {
      return DEFAULT_HISTORY_LIMIT;
    }

    const normalizedValue: string = rawLimit.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      throw new Error(
        `Неверный limit "${rawLimit}". Используй число от 1 до ${MAX_HISTORY_LIMIT}.`,
      );
    }

    const limit: number = Number.parseInt(normalizedValue, 10);

    if (limit < 1 || limit > MAX_HISTORY_LIMIT) {
      throw new Error(
        `Неверный limit "${rawLimit}". Используй число от 1 до ${MAX_HISTORY_LIMIT}.`,
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

    if (offset < 0 || offset > MAX_HISTORY_OFFSET) {
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
    chainKey: ChainKey,
    normalizedAddress: string,
    limit: number,
    offset: number,
    historyKind: HistoryKind,
    historyDirection: HistoryDirectionFilter,
  ): Promise<readonly WalletEventHistoryView[]> {
    const rawFetchLimit: number = Math.min(
      Math.max(offset + limit + LOCAL_EVENTS_BUFFER, limit),
      LOCAL_EVENTS_MAX_FETCH,
    );
    const rawEvents: readonly WalletEventHistoryView[] =
      await this.walletEventsRepository.listRecentByTrackedAddress(
        chainKey,
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

  private mapSettings(row: UserAlertSettingsRow): UserAlertSettingsSnapshot {
    const thresholdUsdRaw: number = Number.parseFloat(String(row.threshold_usd));
    const minAmountUsdRaw: number = Number.parseFloat(String(row.min_amount_usd));
    const normalizedThresholdUsd: number = Number.isNaN(thresholdUsdRaw) ? 0 : thresholdUsdRaw;
    const normalizedMinAmountUsd: number = Number.isNaN(minAmountUsdRaw) ? 0 : minAmountUsdRaw;
    const effectiveThresholdUsd: number = Math.max(normalizedThresholdUsd, normalizedMinAmountUsd);
    const smartFilterType: AlertSmartFilterType = this.parseStoredSmartFilterType(
      row.smart_filter_type,
    );
    const includeDexes: readonly string[] = this.normalizeStoredDexFilter(row.include_dexes);
    const excludeDexes: readonly string[] = this.normalizeStoredDexFilter(row.exclude_dexes);
    const cexFlowMode: AlertCexFlowMode = this.parseStoredCexFlowMode(row.cex_flow_mode);

    return {
      thresholdUsd: effectiveThresholdUsd,
      minAmountUsd: effectiveThresholdUsd,
      cexFlowMode,
      smartFilterType,
      includeDexes,
      excludeDexes,
      quietHoursFrom: row.quiet_from,
      quietHoursTo: row.quiet_to,
      timezone: row.timezone,
    };
  }

  private formatQuietHours(settingsSnapshot: UserAlertSettingsSnapshot): string {
    if (settingsSnapshot.quietHoursFrom === null || settingsSnapshot.quietHoursTo === null) {
      return 'off';
    }

    return `${settingsSnapshot.quietHoursFrom}-${settingsSnapshot.quietHoursTo}`;
  }

  private parseUsdThresholdValue(rawValue: string): number {
    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (normalizedValue === 'off' || normalizedValue === '0') {
      return 0;
    }

    if (!/^\d+(\.\d+)?$/.test(normalizedValue)) {
      throw new Error('Неверный формат суммы. Используй число или off.');
    }

    const parsedValue: number = Number.parseFloat(normalizedValue);

    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      throw new Error('Сумма должна быть неотрицательной.');
    }

    return parsedValue;
  }

  private parseCexFlowMode(rawValue: string): AlertCexFlowMode {
    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (normalizedValue === 'off') {
      return AlertCexFlowMode.OFF;
    }

    if (normalizedValue === 'in') {
      return AlertCexFlowMode.IN;
    }

    if (normalizedValue === 'out') {
      return AlertCexFlowMode.OUT;
    }

    if (normalizedValue === 'all') {
      return AlertCexFlowMode.ALL;
    }

    throw new Error('Неверный cex фильтр. Используй: /filter cex <off|in|out|all>.');
  }

  private parseSmartFilterType(rawValue: string): AlertSmartFilterType {
    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (normalizedValue === 'off' || normalizedValue === 'all') {
      return AlertSmartFilterType.ALL;
    }

    if (normalizedValue === 'buy') {
      return AlertSmartFilterType.BUY;
    }

    if (normalizedValue === 'sell') {
      return AlertSmartFilterType.SELL;
    }

    if (normalizedValue === 'transfer') {
      return AlertSmartFilterType.TRANSFER;
    }

    throw new Error('Неверный type фильтр. Используй: /filter type <all|buy|sell|transfer>.');
  }

  private parseDexFilterList(rawValue: string): readonly string[] {
    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (
      normalizedValue === 'off' ||
      normalizedValue === 'none' ||
      normalizedValue === 'all' ||
      normalizedValue === '0'
    ) {
      return [];
    }

    const rawParts: readonly string[] = normalizedValue
      .split(',')
      .map((token: string): string => token.trim())
      .filter((token: string): boolean => token.length > 0);

    if (rawParts.length === 0) {
      throw new Error('DEX список пуст. Используй /filter include_dex <dex|off>.');
    }

    const normalizedDexes: string[] = [];

    for (const rawPart of rawParts) {
      const normalizedDex: string | null = normalizeDexKey(rawPart);

      if (normalizedDex === null) {
        throw new Error(`Не удалось распознать DEX: ${rawPart}.`);
      }

      if (!normalizedDexes.includes(normalizedDex)) {
        normalizedDexes.push(normalizedDex);
      }
    }

    return normalizedDexes;
  }

  private parseStoredSmartFilterType(rawValue: string | null | undefined): AlertSmartFilterType {
    const normalizedValue: string = (rawValue ?? '').trim().toLowerCase();

    if (normalizedValue === 'buy') {
      return AlertSmartFilterType.BUY;
    }

    if (normalizedValue === 'sell') {
      return AlertSmartFilterType.SELL;
    }

    if (normalizedValue === 'transfer') {
      return AlertSmartFilterType.TRANSFER;
    }

    return AlertSmartFilterType.ALL;
  }

  private parseStoredCexFlowMode(rawValue: string | null | undefined): AlertCexFlowMode {
    const normalizedValue: string = (rawValue ?? '').trim().toLowerCase();

    if (normalizedValue === 'in') {
      return AlertCexFlowMode.IN;
    }

    if (normalizedValue === 'out') {
      return AlertCexFlowMode.OUT;
    }

    if (normalizedValue === 'all') {
      return AlertCexFlowMode.ALL;
    }

    return AlertCexFlowMode.OFF;
  }

  private normalizeStoredDexFilter(
    rawValue: readonly string[] | null | undefined,
  ): readonly string[] {
    if (!rawValue || rawValue.length === 0) {
      return [];
    }

    const normalizedDexes: string[] = [];

    for (const rawItem of rawValue) {
      const normalizedDex: string | null = normalizeDexKey(rawItem);

      if (normalizedDex === null) {
        continue;
      }

      if (!normalizedDexes.includes(normalizedDex)) {
        normalizedDexes.push(normalizedDex);
      }
    }

    return normalizedDexes;
  }

  private formatDexFilter(values: readonly string[]): string {
    if (values.length === 0) {
      return 'all';
    }

    return values.join(', ');
  }

  private parseQuietHours(rawWindow: string): {
    readonly quietFrom: string | null;
    readonly quietTo: string | null;
  } {
    const normalizedValue: string = rawWindow.trim().toLowerCase();

    if (normalizedValue === 'off') {
      return {
        quietFrom: null,
        quietTo: null,
      };
    }

    const quietRangePattern: RegExp = /^(?<from>\d{2}:\d{2})-(?<to>\d{2}:\d{2})$/;
    const rangeMatch: RegExpExecArray | null = quietRangePattern.exec(normalizedValue);

    if (!rangeMatch?.groups) {
      throw new Error('Неверный формат quiet. Используй /quiet <HH:mm-HH:mm|off>.');
    }

    const quietFrom: string = rangeMatch.groups['from'] ?? '';
    const quietTo: string = rangeMatch.groups['to'] ?? '';

    if (!this.isValidTimeToken(quietFrom) || !this.isValidTimeToken(quietTo)) {
      throw new Error('Quiet-hours должен быть в формате HH:mm-HH:mm.');
    }

    return {
      quietFrom,
      quietTo,
    };
  }

  private parseTimezone(rawTimezone: string): string {
    const timezone: string = rawTimezone.trim();

    if (timezone.length === 0) {
      throw new Error('Таймзона пустая. Пример: /tz Europe/Moscow');
    }

    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
      });
    } catch {
      throw new Error(
        'Неизвестная таймзона. Используй IANA формат, например Europe/Moscow или America/New_York.',
      );
    }

    return timezone;
  }

  private isValidTimeToken(value: string): boolean {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      return false;
    }

    const [hourPart, minutePart] = value.split(':');
    const hour: number = Number.parseInt(hourPart ?? '', 10);
    const minute: number = Number.parseInt(minutePart ?? '', 10);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return false;
    }

    return hour >= 0 && hour <= MAX_HOUR && minute >= 0 && minute <= MAX_MINUTE;
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
    return new Date(now.getTime() + minutes * MINUTES_TO_MS);
  }

  private formatHistoryMessage(
    normalizedAddress: string,
    transactions: readonly IHistoryItemDto[],
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
      const txUrl: string = tx.txLink ?? this.buildTxUrl(tx.txHash);
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
    chainKey: ChainKey = ChainKey.ETHEREUM_MAINNET,
  ): string {
    const rows: string[] = events.map((event, index: number): string => {
      const txChainKey: ChainKey = this.resolveHistoryTxChainKey(event.chainKey, chainKey);
      const txUrl: string = this.buildTxUrl(event.txHash, txChainKey);
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

  private formatWalletCardRecentEvents(
    events: readonly WalletEventHistoryView[],
  ): readonly string[] {
    if (events.length === 0) {
      return ['- пока нет локальных событий'];
    }

    return events.map((event, index: number): string => {
      const txHashShort: string = this.shortHash(event.txHash);
      const directionLabel: string = this.resolveDirectionLabel(event.direction);
      const eventValue: string = this.resolveEventValue(event);
      const eventTimestamp: string = this.formatTimestamp(event.occurredAt);

      return `${index + 1}. ${directionLabel} ${event.eventType} • ${eventValue} • ${eventTimestamp} • ${txHashShort}`;
    });
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
      return Number.parseFloat(formatted).toFixed(ASSET_VALUE_PRECISION);
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

  private buildTxUrl(txHash: string, chainKey: ChainKey = ChainKey.ETHEREUM_MAINNET): string {
    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return `https://solscan.io/tx/${txHash}`;
    }

    if (chainKey === ChainKey.TRON_MAINNET) {
      return `${this.appConfigService.tronscanTxBaseUrl}${txHash}`;
    }

    return `${this.appConfigService.etherscanTxBaseUrl}${txHash}`;
  }

  private resolveHistoryTxChainKey(
    rawChainKey: string | null,
    fallbackChainKey: ChainKey,
  ): ChainKey {
    if (rawChainKey === ChainKey.ETHEREUM_MAINNET) {
      return ChainKey.ETHEREUM_MAINNET;
    }

    if (rawChainKey === ChainKey.SOLANA_MAINNET) {
      return ChainKey.SOLANA_MAINNET;
    }

    if (rawChainKey === ChainKey.TRON_MAINNET) {
      return ChainKey.TRON_MAINNET;
    }

    return fallbackChainKey;
  }

  private shortHash(txHash: string): string {
    const prefix: string = txHash.slice(0, SHORT_HASH_PREFIX_LENGTH);
    const suffix: string = txHash.slice(SHORT_HASH_SUFFIX_OFFSET);
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
      readonly chainKey?: ChainKey;
      readonly walletAddress: string;
      readonly walletLabel: string | null;
    }[],
    targetWalletId: number,
  ): {
    readonly walletId: number;
    readonly chainKey: ChainKey;
    readonly walletAddress: string;
    readonly walletLabel: string | null;
  } | null {
    for (const subscription of subscriptions) {
      const subscriptionWalletId: number | null = this.normalizeDbId(subscription.walletId);

      if (subscriptionWalletId === targetWalletId) {
        return {
          walletId: subscriptionWalletId,
          chainKey: subscription.chainKey ?? ChainKey.ETHEREUM_MAINNET,
          walletAddress: subscription.walletAddress,
          walletLabel: subscription.walletLabel,
        };
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
