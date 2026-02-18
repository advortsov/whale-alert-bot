import { Inject, Injectable, Logger } from '@nestjs/common';

import { TrackingAddressService } from './tracking-address.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingSettingsParserService } from './tracking-settings-parser.service';
import {
  AlertFilterToggleTarget,
  type TelegramUserRef,
  type TrackedWalletOption,
  type UserAlertSettingsSnapshot,
  type WalletAlertFilterState,
} from './tracking.interfaces';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import type { IAddressCodecRegistry } from '../core/ports/address/address-codec-registry.interfaces';
import { ADDRESS_CODEC_REGISTRY } from '../core/ports/address/address-port.tokens';
import type {
  AlertMuteRow,
  UserAlertPreferenceRow,
  UserWalletAlertPreferenceRow,
} from '../database/types/database.types';
import { AlertMutesRepository } from '../database/repositories/alert-mutes.repository';
import { SubscriptionsRepository } from '../database/repositories/subscriptions.repository';
import { TrackedWalletsRepository } from '../database/repositories/tracked-wallets.repository';
import { AlertEventFilterType } from '../database/repositories/user-alert-preferences.interfaces';
import { UserAlertPreferencesRepository } from '../database/repositories/user-alert-preferences.repository';
import { UserAlertSettingsRepository } from '../database/repositories/user-alert-settings.repository';
import { UserWalletAlertPreferencesRepository } from '../database/repositories/user-wallet-alert-preferences.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { WalletEventsRepository } from '../database/repositories/wallet-events.repository';

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

  public async trackAddress(
    userRef: TelegramUserRef,
    rawAddress: string,
    label: string | null,
    chainKey: ChainKey,
  ): Promise<string> {
    this.logger.debug(
      `trackAddress start telegramId=${userRef.telegramId} chainKey=${chainKey} rawAddress=${rawAddress} label=${label ?? 'n/a'}`,
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

    if (!insertedSubscription) {
      return [
        `Адрес уже отслеживается: #${wallet.id} [${chainKey}] ${normalizedAddress}.`,
        `История: /history #${wallet.id} ${DEFAULT_HISTORY_LIMIT}`,
      ].join('\n');
    }

    return this.buildTrackSuccessMessage(wallet.id, chainKey, normalizedAddress, label);
  }

  public async listTrackedAddresses(userRef: TelegramUserRef): Promise<string> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const subscriptions = await this.deps.subscriptionsRepository.listByUserId(user.id);

    if (subscriptions.length === 0) {
      return [
        'Список отслеживания пуст.',
        'Добавь первый адрес:',
        '/track <chain> <address> [label]',
      ].join('\n');
    }

    const rows: string[] = subscriptions.map((subscription, index: number): string => {
      const walletId: number | null = this.deps.trackingAddressService.normalizeDbId(
        subscription.walletId,
      );
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

  public async getWalletDetails(userRef: TelegramUserRef, rawWalletId: string): Promise<string> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const walletSubscription = await this.deps.trackingAddressService.resolveWalletSubscription(
      user.id,
      rawWalletId,
    );

    const [globalPreferences, settings, walletPreferences, activeMute, recentEvents] =
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
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(settings);
    const allowTransfer: boolean = walletPreferences
      ? walletPreferences.allow_transfer
      : globalPreferences.allow_transfer;
    const allowSwap: boolean = walletPreferences
      ? walletPreferences.allow_swap
      : globalPreferences.allow_swap;
    const filterSource: string = walletPreferences === null ? 'global' : 'wallet override';
    const recentEventRows: readonly string[] =
      this.deps.historyFormatter.formatWalletCardRecentEvents(recentEvents);
    const muteStatusText: string =
      activeMute === null
        ? 'off'
        : this.deps.settingsParserService.formatTimestamp(activeMute.mute_until);

    return [
      `💼 Кошелек #${walletSubscription.walletId}`,
      `⛓ Сеть: ${walletSubscription.chainKey}`,
      `🏷 Label: ${walletSubscription.walletLabel ?? 'без ярлыка'}`,
      `📍 Address: ${walletSubscription.walletAddress}`,
      `🔔 Фильтры: transfer=${allowTransfer ? 'on' : 'off'}, swap=${allowSwap ? 'on' : 'off'} (${filterSource})`,
      `💵 USD filter: >= ${settingsSnapshot.thresholdUsd.toFixed(2)}`,
      `🏦 CEX flow: ${settingsSnapshot.cexFlowMode}`,
      `🧠 Smart: type=${settingsSnapshot.smartFilterType}, include_dex=${this.deps.settingsParserService.formatDexFilter(settingsSnapshot.includeDexes)}, exclude_dex=${this.deps.settingsParserService.formatDexFilter(settingsSnapshot.excludeDexes)}`,
      `🌙 Quiet: ${this.deps.settingsParserService.formatQuietHours(settingsSnapshot)} (${settingsSnapshot.timezone})`,
      `🚫 Ignore 24h до: ${muteStatusText}`,
      '',
      `🧾 Последние события (${recentEvents.length}/${WALLET_CARD_RECENT_EVENTS_LIMIT}):`,
      ...recentEventRows,
      '',
      '👇 Действия доступны кнопками ниже.',
    ].join('\n');
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

  public async muteWalletAlertsForDuration(
    userRef: TelegramUserRef,
    rawWalletId: string,
    muteMinutes: number,
    source: string,
  ): Promise<string> {
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

    return [
      `Кошелек #${String(walletSubscription.walletId)} (${walletSubscription.walletLabel ?? 'без ярлыка'}) временно отключен.`,
      `До: ${this.deps.settingsParserService.formatTimestamp(upsertedMute.mute_until)}`,
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
