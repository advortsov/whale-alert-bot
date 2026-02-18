import { Inject, Injectable } from '@nestjs/common';

import { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingSettingsParserService } from './tracking-settings-parser.service';
import {
  AlertFilterToggleTarget,
  type TelegramUserRef,
  type UserAlertPreferences,
  type UserAlertSettingsSnapshot,
} from './tracking.interfaces';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { AlertCexFlowMode } from '../features/alerts/cex-flow.interfaces';
import { AlertSmartFilterType } from '../features/alerts/smart-filter.interfaces';
import type { UserAlertPreferenceRow, UserAlertSettingsRow } from '../database/types/database.types';
import { AlertEventFilterType } from '../database/repositories/user-alert-preferences.interfaces';
import { UserAlertPreferencesRepository } from '../database/repositories/user-alert-preferences.repository';
import { UserAlertSettingsRepository } from '../database/repositories/user-alert-settings.repository';
import { UsersRepository } from '../database/repositories/users.repository';

@Injectable()
export class TrackingSettingsServiceDependencies {
  @Inject(UsersRepository)
  public readonly usersRepository!: UsersRepository;

  @Inject(UserAlertPreferencesRepository)
  public readonly userAlertPreferencesRepository!: UserAlertPreferencesRepository;

  @Inject(UserAlertSettingsRepository)
  public readonly userAlertSettingsRepository!: UserAlertSettingsRepository;

  @Inject(HistoryRateLimiterService)
  public readonly historyRateLimiterService!: HistoryRateLimiterService;

  @Inject(TrackingSettingsParserService)
  public readonly settingsParserService!: TrackingSettingsParserService;
}

@Injectable()
export class TrackingSettingsService {
  public constructor(private readonly deps: TrackingSettingsServiceDependencies) {}

  public async getUserAlertFilters(userRef: TelegramUserRef): Promise<string> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const [preferencesRow, settingsRow] = await Promise.all([
      this.deps.userAlertPreferencesRepository.findOrCreateByUserId(user.id),
      this.deps.userAlertSettingsRepository.findOrCreateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
      ),
    ]);
    const preferences: UserAlertPreferences =
      this.deps.settingsParserService.mapPreferences(preferencesRow);
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(settingsRow);
    const mutedUntilText: string = preferences.mutedUntil
      ? this.deps.settingsParserService.formatTimestamp(preferences.mutedUntil)
      : 'выключен';

    return [
      'Текущие фильтры алертов:',
      `- threshold usd: ${settingsSnapshot.thresholdUsd.toFixed(2)}`,
      '- /filter min_amount_usd: legacy alias -> /threshold',
      `- cex flow: ${settingsSnapshot.cexFlowMode}`,
      `- type: ${settingsSnapshot.smartFilterType}`,
      `- include dex: ${this.deps.settingsParserService.formatDexFilter(settingsSnapshot.includeDexes)}`,
      `- exclude dex: ${this.deps.settingsParserService.formatDexFilter(settingsSnapshot.excludeDexes)}`,
      `- transfer: ${preferences.allowTransfer ? 'on' : 'off'}`,
      `- swap: ${preferences.allowSwap ? 'on' : 'off'}`,
      `- mute до: ${mutedUntilText}`,
      `- quiet: ${this.deps.settingsParserService.formatQuietHours(settingsSnapshot)} (${settingsSnapshot.timezone})`,
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

  public async getUserStatus(userRef: TelegramUserRef): Promise<string> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const [preferencesRow, settingsRow] = await Promise.all([
      this.deps.userAlertPreferencesRepository.findOrCreateByUserId(user.id),
      this.deps.userAlertSettingsRepository.findOrCreateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
      ),
    ]);
    const preferences: UserAlertPreferences =
      this.deps.settingsParserService.mapPreferences(preferencesRow);
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(settingsRow);
    const historyQuota = this.deps.historyRateLimiterService.getSnapshot(userRef.telegramId);

    return [
      'Пользовательский статус:',
      `- threshold usd: ${settingsSnapshot.thresholdUsd.toFixed(2)}`,
      '- /filter min_amount_usd: legacy alias -> /threshold',
      `- cex flow: ${settingsSnapshot.cexFlowMode}`,
      `- type: ${settingsSnapshot.smartFilterType}`,
      `- include dex: ${this.deps.settingsParserService.formatDexFilter(settingsSnapshot.includeDexes)}`,
      `- exclude dex: ${this.deps.settingsParserService.formatDexFilter(settingsSnapshot.excludeDexes)}`,
      `- transfer: ${preferences.allowTransfer ? 'on' : 'off'}`,
      `- swap: ${preferences.allowSwap ? 'on' : 'off'}`,
      `- mute до: ${preferences.mutedUntil ? this.deps.settingsParserService.formatTimestamp(preferences.mutedUntil) : 'выключен'}`,
      `- quiet: ${this.deps.settingsParserService.formatQuietHours(settingsSnapshot)} (${settingsSnapshot.timezone})`,
      `- history quota: ${historyQuota.minuteUsed}/${historyQuota.minuteLimit} (remaining ${historyQuota.minuteRemaining})`,
      `- history callback cooldown retry: ${historyQuota.callbackRetryAfterSec} sec`,
    ].join('\n');
  }

  public async setMuteAlerts(userRef: TelegramUserRef, rawMinutes: string): Promise<string> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const mutedUntil: Date | null = this.deps.settingsParserService.parseMuteUntil(rawMinutes);
    const updatedRow: UserAlertPreferenceRow =
      await this.deps.userAlertPreferencesRepository.updateMute(user.id, mutedUntil);
    const preferences: UserAlertPreferences =
      this.deps.settingsParserService.mapPreferences(updatedRow);

    if (preferences.mutedUntil === null) {
      return 'Mute выключен. Алерты снова активны.';
    }

    return `Алерты отключены до ${this.deps.settingsParserService.formatTimestamp(preferences.mutedUntil)}.`;
  }

  public async setThresholdUsd(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const thresholdUsd: number = this.deps.settingsParserService.parseUsdThresholdValue(rawValue);
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.deps.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          thresholdUsd,
          minAmountUsd: thresholdUsd,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(updatedSettings);
    return `Порог USD обновлен: ${settingsSnapshot.thresholdUsd.toFixed(2)}.`;
  }

  public async setMinAmountUsd(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const thresholdMessage: string = await this.setThresholdUsd(userRef, rawValue);
    return `${thresholdMessage}\nКоманда /filter min_amount_usd помечена как legacy alias для /threshold.`;
  }

  public async setCexFlowFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const cexFlowMode: AlertCexFlowMode =
      this.deps.settingsParserService.parseCexFlowMode(rawValue);
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.deps.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        { cexFlowMode },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(updatedSettings);
    return `CEX flow фильтр обновлен: ${settingsSnapshot.cexFlowMode}.`;
  }

  public async setSmartFilterType(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const smartFilterType: AlertSmartFilterType =
      this.deps.settingsParserService.parseSmartFilterType(rawValue);
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.deps.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        { smartFilterType },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(updatedSettings);
    return `Smart type обновлен: ${settingsSnapshot.smartFilterType}.`;
  }

  public async setIncludeDexFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const includeDexes: readonly string[] =
      this.deps.settingsParserService.parseDexFilterList(rawValue);
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.deps.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        { includeDexes },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(updatedSettings);
    return `Include DEX фильтр обновлен: ${this.deps.settingsParserService.formatDexFilter(settingsSnapshot.includeDexes)}.`;
  }

  public async setExcludeDexFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    const excludeDexes: readonly string[] =
      this.deps.settingsParserService.parseDexFilterList(rawValue);
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.deps.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        { excludeDexes },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(updatedSettings);
    return `Exclude DEX фильтр обновлен: ${this.deps.settingsParserService.formatDexFilter(settingsSnapshot.excludeDexes)}.`;
  }

  public async setQuietHours(userRef: TelegramUserRef, rawWindow: string): Promise<string> {
    const quietWindow: {
      readonly quietFrom: string | null;
      readonly quietTo: string | null;
    } = this.deps.settingsParserService.parseQuietHours(rawWindow);
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.deps.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        {
          quietFrom: quietWindow.quietFrom,
          quietTo: quietWindow.quietTo,
        },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(updatedSettings);
    return `Quiet hours: ${this.deps.settingsParserService.formatQuietHours(settingsSnapshot)} (${settingsSnapshot.timezone}).`;
  }

  public async setUserTimezone(userRef: TelegramUserRef, rawTimezone: string): Promise<string> {
    const timezone: string = this.deps.settingsParserService.parseTimezone(rawTimezone);
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const updatedSettings: UserAlertSettingsRow =
      await this.deps.userAlertSettingsRepository.updateByUserAndChain(
        user.id,
        ChainKey.ETHEREUM_MAINNET,
        { timezone },
      );
    const settingsSnapshot: UserAlertSettingsSnapshot =
      this.deps.settingsParserService.mapSettings(updatedSettings);
    return `Таймзона обновлена: ${settingsSnapshot.timezone}.`;
  }

  public async setEventTypeFilter(
    userRef: TelegramUserRef,
    target: AlertFilterToggleTarget,
    enabled: boolean,
  ): Promise<string> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const targetType: AlertEventFilterType =
      target === AlertFilterToggleTarget.TRANSFER
        ? AlertEventFilterType.TRANSFER
        : AlertEventFilterType.SWAP;
    await this.deps.userAlertPreferencesRepository.updateEventType(user.id, targetType, enabled);

    return `Фильтр ${target} -> ${enabled ? 'on' : 'off'}.`;
  }
}
