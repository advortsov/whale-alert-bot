import { Inject, Injectable, Logger } from '@nestjs/common';

import { TrackingAddressService } from './tracking-address.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingSettingsParserService } from './tracking-settings-parser.service';
import type { IAddressCodecRegistry } from '../../../common/interfaces/address/address-codec-registry.interfaces';
import { ADDRESS_CODEC_REGISTRY } from '../../../common/interfaces/address/address-port.tokens';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { AlertMutesRepository } from '../../../database/repositories/alert-mutes.repository';
import { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import { TrackedWalletsRepository } from '../../../database/repositories/tracked-wallets.repository';
import { AlertEventFilterType } from '../../../database/repositories/user-alert-preferences.interfaces';
import { UserAlertPreferencesRepository } from '../../../database/repositories/user-alert-preferences.repository';
import { UserAlertSettingsRepository } from '../../../database/repositories/user-alert-settings.repository';
import { UserWalletAlertPreferencesRepository } from '../../../database/repositories/user-wallet-alert-preferences.repository';
import { UsersRepository } from '../../../database/repositories/users.repository';
import { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import type {
  AlertMuteRow,
  UserAlertPreferenceRow,
  UserWalletAlertPreferenceRow,
} from '../../../database/types/database.types';
import {
  AlertFilterToggleTarget,
  type TelegramUserRef,
  type TrackedWalletOption,
  type WalletAlertFilterState,
} from '../entities/tracking.interfaces';
import type {
  IMuteWalletResult,
  ITrackWalletResult,
  IUntrackResult,
  IWalletDetailResult,
  IWalletListResult,
} from '../interfaces/tracking-wallets.result';

const DEFAULT_HISTORY_LIMIT = 5;
const WALLET_CARD_RECENT_EVENTS_LIMIT = 3;
const MINUTES_TO_MS = 60_000;

@Injectable()
export class TrackingWalletsServiceDependencies {
  @Inject(UsersRepository)
  public readonly usersRepository!: UsersRepository;

  @Inject(TrackedWalletsRepository)
  public readonly trackedWalletsRepository!: TrackedWalletsRepository;

  @Inject(SubscriptionsRepository)
  public readonly subscriptionsRepository!: SubscriptionsRepository;

  @Inject(ADDRESS_CODEC_REGISTRY)
  public readonly addressCodecRegistry!: IAddressCodecRegistry;

  @Inject(TrackingAddressService)
  public readonly trackingAddressService!: TrackingAddressService;

  @Inject(UserAlertPreferencesRepository)
  public readonly userAlertPreferencesRepository!: UserAlertPreferencesRepository;

  @Inject(UserAlertSettingsRepository)
  public readonly userAlertSettingsRepository!: UserAlertSettingsRepository;

  @Inject(UserWalletAlertPreferencesRepository)
  public readonly userWalletAlertPreferencesRepository!: UserWalletAlertPreferencesRepository;

  @Inject(AlertMutesRepository)
  public readonly alertMutesRepository!: AlertMutesRepository;

  @Inject(WalletEventsRepository)
  public readonly walletEventsRepository!: WalletEventsRepository;

  @Inject(TrackingSettingsParserService)
  public readonly settingsParserService!: TrackingSettingsParserService;

  @Inject(TrackingHistoryFormatterService)
  public readonly historyFormatter!: TrackingHistoryFormatterService;
}

@Injectable()
export class TrackingWalletsService {
  private readonly logger: Logger = new Logger(TrackingWalletsService.name);

  public constructor(private readonly deps: TrackingWalletsServiceDependencies) {}

  public async trackWallet(
    userRef: TelegramUserRef,
    rawAddress: string,
    label: string | null,
    chainKey: ChainKey,
  ): Promise<ITrackWalletResult> {
    this.logger.debug(
      `trackWallet start telegramId=${userRef.telegramId} chainKey=${chainKey} rawAddress=${rawAddress} label=${label ?? 'n/a'}`,
    );
    const addressCodec = this.deps.addressCodecRegistry.getCodec(chainKey);

    if (!addressCodec.validate(rawAddress)) {
      throw new Error(this.deps.trackingAddressService.buildInvalidAddressFormatMessage(chainKey));
    }

    const normalizedAddress: string | null = addressCodec.normalize(rawAddress);

    if (normalizedAddress === null) {
      throw new Error(
        this.deps.trackingAddressService.buildInvalidAddressNormalizationMessage(chainKey),
      );
    }

    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const wallet = await this.deps.trackedWalletsRepository.findOrCreate(
      chainKey,
      normalizedAddress,
      label,
    );
    const insertedSubscription = await this.deps.subscriptionsRepository.addSubscription(
      user.id,
      wallet.id,
    );

    return {
      walletId: wallet.id,
      address: normalizedAddress,
      label,
      chainKey,
      isNewSubscription: insertedSubscription !== null,
    };
  }

  public async trackAddress(
    userRef: TelegramUserRef,
    rawAddress: string,
    label: string | null,
    chainKey: ChainKey,
  ): Promise<string> {
    const result: ITrackWalletResult = await this.trackWallet(userRef, rawAddress, label, chainKey);

    if (!result.isNewSubscription) {
      return [
        `Адрес уже отслеживается: #${result.walletId} [${result.chainKey}] ${result.address}.`,
        `История: /history #${result.walletId} ${DEFAULT_HISTORY_LIMIT}`,
      ].join('\n');
    }

    return this.buildTrackSuccessMessage(
      result.walletId,
      result.chainKey,
      result.address,
      result.label,
    );
  }

  public async listWallets(userRef: TelegramUserRef): Promise<IWalletListResult> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const subscriptions = await this.deps.subscriptionsRepository.listByUserId(user.id);

    return {
      wallets: subscriptions.map((s) => ({
        walletId: s.walletId,
        address: s.walletAddress,
        label: s.walletLabel,
        chainKey: s.chainKey,
        createdAt: s.createdAt,
      })),
      totalCount: subscriptions.length,
    };
  }

  public async listTrackedAddresses(userRef: TelegramUserRef): Promise<string> {
    const result: IWalletListResult = await this.listWallets(userRef);

    if (result.totalCount === 0) {
      return [
        'Список отслеживания пуст.',
        'Добавь первый адрес:',
        '/track <chain> <address> [label]',
      ].join('\n');
    }

    const rows: string[] = result.wallets.map((wallet, index: number): string => {
      const walletIdText: string = String(wallet.walletId);
      const labelPart: string = wallet.label ? ` (${wallet.label})` : '';
      return [
        `${index + 1}. #${walletIdText}${labelPart}`,
        `   ${wallet.address}`,
        `   История: /history #${walletIdText} ${DEFAULT_HISTORY_LIMIT}`,
        `   Удалить: /untrack #${walletIdText}`,
      ].join('\n');
    });

    return [`Отслеживаемые адреса (${result.totalCount}):`, ...rows].join('\n');
  }

  public async listTrackedWalletOptions(
    userRef: TelegramUserRef,
  ): Promise<readonly TrackedWalletOption[]> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const subscriptions = await this.deps.subscriptionsRepository.listByUserId(user.id);
    const options: TrackedWalletOption[] = [];

    for (const subscription of subscriptions) {
      const walletId: number | null = this.deps.trackingAddressService.normalizeDbId(
        subscription.walletId,
      );

      if (walletId !== null) {
        options.push({
          walletId,
          walletAddress: subscription.walletAddress,
          walletLabel: subscription.walletLabel,
        });
      }
    }

    return options;
  }

  public async getWalletDetail(
    userRef: TelegramUserRef,
    rawWalletId: string,
  ): Promise<IWalletDetailResult> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.deps.trackingAddressService.resolveWalletSubscription(
      user.id,
      rawWalletId,
    );

    const [globalPreferencesRow, settingsRow, walletPreferences, activeMute, recentEvents] =
      await Promise.all([
        this.deps.userAlertPreferencesRepository.findOrCreateByUserId(user.id),
        this.deps.userAlertSettingsRepository.findOrCreateByUserAndChain(
          user.id,
          walletSubscription.chainKey,
        ),
        this.deps.userWalletAlertPreferencesRepository.findByUserAndWalletId(
          user.id,
          walletSubscription.walletId,
        ),
        this.deps.alertMutesRepository.findActiveMute(
          user.id,
          walletSubscription.chainKey,
          walletSubscription.walletId,
        ),
        this.deps.walletEventsRepository.listRecentByTrackedAddress(
          walletSubscription.chainKey,
          walletSubscription.walletAddress,
          WALLET_CARD_RECENT_EVENTS_LIMIT,
          0,
        ),
      ]);

    const globalPreferences = this.deps.settingsParserService.mapPreferences(globalPreferencesRow);
    const settingsSnapshot = this.deps.settingsParserService.mapSettings(settingsRow);

    return {
      walletId: walletSubscription.walletId,
      address: walletSubscription.walletAddress,
      label: walletSubscription.walletLabel,
      chainKey: walletSubscription.chainKey,
      globalPreferences,
      walletPreferences: walletPreferences
        ? {
            allowTransfer: walletPreferences.allow_transfer,
            allowSwap: walletPreferences.allow_swap,
            hasOverride: true,
          }
        : null,
      settings: settingsSnapshot,
      activeMute: activeMute?.mute_until ?? null,
      recentEvents,
    };
  }

  public async getWalletDetails(userRef: TelegramUserRef, rawWalletId: string): Promise<string> {
    const detail: IWalletDetailResult = await this.getWalletDetail(userRef, rawWalletId);
    const allowTransfer: boolean = detail.walletPreferences
      ? detail.walletPreferences.allowTransfer
      : detail.globalPreferences.allowTransfer;
    const allowSwap: boolean = detail.walletPreferences
      ? detail.walletPreferences.allowSwap
      : detail.globalPreferences.allowSwap;
    const filterSource: string = detail.walletPreferences === null ? 'global' : 'wallet override';
    const recentEventRows: readonly string[] =
      this.deps.historyFormatter.formatWalletCardRecentEvents(detail.recentEvents);
    const muteStatusText: string =
      detail.activeMute === null
        ? 'off'
        : this.deps.settingsParserService.formatTimestamp(detail.activeMute);

    return [
      `\u{1F4BC} \u041A\u043E\u0448\u0435\u043B\u0435\u043A #${detail.walletId}`,
      `\u26D3 \u0421\u0435\u0442\u044C: ${detail.chainKey}`,
      `\u{1F3F7} Label: ${detail.label ?? '\u0431\u0435\u0437 \u044F\u0440\u043B\u044B\u043A\u0430'}`,
      `\u{1F4CD} Address: ${detail.address}`,
      `\u{1F514} \u0424\u0438\u043B\u044C\u0442\u0440\u044B: transfer=${allowTransfer ? 'on' : 'off'}, swap=${allowSwap ? 'on' : 'off'} (${filterSource})`,
      `\u{1F4B5} USD filter: >= ${detail.settings.thresholdUsd.toFixed(2)}`,
      `\u{1F3E6} CEX flow: ${detail.settings.cexFlowMode}`,
      `\u{1F9E0} Smart: type=${detail.settings.smartFilterType}, include_dex=${this.deps.settingsParserService.formatDexFilter(detail.settings.includeDexes)}, exclude_dex=${this.deps.settingsParserService.formatDexFilter(detail.settings.excludeDexes)}`,
      `\u{1F319} Quiet: ${this.deps.settingsParserService.formatQuietHours(detail.settings)} (${detail.settings.timezone})`,
      `\u{1F6AB} Ignore 24h \u0434\u043E: ${muteStatusText}`,
      '',
      `\u{1F9FE} \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F (${detail.recentEvents.length}/${WALLET_CARD_RECENT_EVENTS_LIMIT}):`,
      ...recentEventRows,
      '',
      '\u{1F447} \u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B \u043A\u043D\u043E\u043F\u043A\u0430\u043C\u0438 \u043D\u0438\u0436\u0435.',
    ].join('\n');
  }

  public async removeWallet(userRef: TelegramUserRef, walletId: number): Promise<IUntrackResult> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.deps.trackingAddressService.resolveWalletSubscription(
      user.id,
      `#${String(walletId)}`,
    );
    const removed: boolean = await this.deps.subscriptionsRepository.removeByWalletId(
      user.id,
      walletSubscription.walletId,
    );

    if (!removed) {
      throw new Error(`Subscription not found for wallet #${String(walletId)}`);
    }

    return {
      walletId: walletSubscription.walletId,
      address: walletSubscription.walletAddress,
      chainKey: walletSubscription.chainKey,
    };
  }

  public async untrackAddress(userRef: TelegramUserRef, rawIdentifier: string): Promise<string> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletId: number | null = this.deps.trackingAddressService.parseWalletId(rawIdentifier);

    if (walletId !== null) {
      const removedById: boolean = await this.deps.subscriptionsRepository.removeByWalletId(
        user.id,
        walletId,
      );
      return removedById
        ? `Удалил адрес с id #${walletId} из отслеживания.`
        : `Не нашел подписку с id #${walletId}. Проверь список через /list.`;
    }

    const normalizedAddresses: readonly {
      readonly chainKey: ChainKey;
      readonly address: string;
    }[] = this.deps.trackingAddressService.resolveNormalizedAddressCandidates(rawIdentifier);

    if (normalizedAddresses.length === 0) {
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
      const removedByAddress: boolean = await this.deps.subscriptionsRepository.removeByAddress(
        user.id,
        normalizedAddress.chainKey,
        normalizedAddress.address,
      );

      if (removedByAddress) {
        return `Удалил адрес [${normalizedAddress.chainKey}] ${normalizedAddress.address} из отслеживания.`;
      }
    }

    return `Адрес ${normalizedAddresses[0]?.address ?? rawIdentifier} не найден в списке. Проверь /list.`;
  }

  public async muteWallet(
    userRef: TelegramUserRef,
    rawWalletId: string,
    muteMinutes: number,
    source: string,
  ): Promise<IMuteWalletResult> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.deps.trackingAddressService.resolveWalletSubscription(
      user.id,
      rawWalletId,
    );

    if (!Number.isSafeInteger(muteMinutes) || muteMinutes <= 0 || muteMinutes > 10_080) {
      throw new Error('mute для кошелька должен быть от 1 до 10080 минут.');
    }

    const muteUntil: Date = new Date(Date.now() + muteMinutes * MINUTES_TO_MS);
    const upsertedMute: AlertMuteRow = await this.deps.alertMutesRepository.upsertMute({
      userId: user.id,
      chainKey: walletSubscription.chainKey,
      walletId: walletSubscription.walletId,
      muteUntil,
      source,
    });

    return {
      walletId: walletSubscription.walletId,
      mutedUntil: upsertedMute.mute_until,
    };
  }

  public async muteWalletAlertsForDuration(
    userRef: TelegramUserRef,
    rawWalletId: string,
    muteMinutes: number,
    source: string,
  ): Promise<string> {
    const result: IMuteWalletResult = await this.muteWallet(
      userRef,
      rawWalletId,
      muteMinutes,
      source,
    );

    return [
      `Кошелек #${String(result.walletId)} временно отключен.`,
      `До: ${this.deps.settingsParserService.formatTimestamp(result.mutedUntil)}`,
    ].join('\n');
  }

  public async getWalletAlertFilterState(
    userRef: TelegramUserRef,
    rawWalletId: string,
  ): Promise<WalletAlertFilterState> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.deps.trackingAddressService.resolveWalletSubscription(
      user.id,
      rawWalletId,
    );
    const globalPreferences: UserAlertPreferenceRow =
      await this.deps.userAlertPreferencesRepository.findOrCreateByUserId(user.id);
    const walletPreferences: UserWalletAlertPreferenceRow | null =
      await this.deps.userWalletAlertPreferencesRepository.findByUserAndWalletId(
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
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.deps.trackingAddressService.resolveWalletSubscription(
      user.id,
      rawWalletId,
    );

    await this.deps.userWalletAlertPreferencesRepository.updateEventType(
      user.id,
      walletSubscription.walletId,
      this.mapAlertFilterTarget(target),
      enabled,
    );

    return this.getWalletAlertFilterState(userRef, `#${String(walletSubscription.walletId)}`);
  }

  private buildTrackSuccessMessage(
    walletId: number,
    chainKey: ChainKey,
    normalizedAddress: string,
    label: string | null,
  ): string {
    const titleSuffix: string = label ? ` (${label})` : '';
    return [
      `Добавил адрес #${walletId} [${chainKey}] ${normalizedAddress}${titleSuffix}.`,
      `История: /history #${walletId} ${DEFAULT_HISTORY_LIMIT}`,
      `Удалить: /untrack #${walletId}`,
    ].join('\n');
  }

  private mapAlertFilterTarget(target: AlertFilterToggleTarget): AlertEventFilterType {
    return target === AlertFilterToggleTarget.TRANSFER
      ? AlertEventFilterType.TRANSFER
      : AlertEventFilterType.SWAP;
  }
}
