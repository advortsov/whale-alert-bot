import { Injectable } from '@nestjs/common';

import type { UserAlertPreferences, UserAlertSettingsSnapshot } from './tracking.interfaces';
import type {
  UserAlertPreferenceRow,
  UserAlertSettingsRow,
} from '../database/types/database.types';
import { AlertCexFlowMode } from '../features/alerts/cex-flow.interfaces';
import { normalizeDexKey } from '../features/alerts/dex-normalizer.util';
import { AlertSmartFilterType } from '../features/alerts/smart-filter.interfaces';

const MAX_HOUR = 23;
const MAX_MINUTE = 59;
const MINUTES_TO_MS = 60_000;

@Injectable()
export class TrackingSettingsParserService {
  public mapSettings(row: UserAlertSettingsRow): UserAlertSettingsSnapshot {
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

  public mapPreferences(row: UserAlertPreferenceRow): UserAlertPreferences {
    const minAmount: number = Number.parseFloat(String(row.min_amount));

    return {
      minAmount: Number.isNaN(minAmount) ? 0 : minAmount,
      allowTransfer: row.allow_transfer,
      allowSwap: row.allow_swap,
      mutedUntil: row.muted_until,
    };
  }

  public formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  }

  public formatQuietHours(settingsSnapshot: UserAlertSettingsSnapshot): string {
    if (settingsSnapshot.quietHoursFrom === null || settingsSnapshot.quietHoursTo === null) {
      return 'off';
    }

    return `${settingsSnapshot.quietHoursFrom}-${settingsSnapshot.quietHoursTo}`;
  }

  public formatDexFilter(values: readonly string[]): string {
    return values.length === 0 ? 'all' : values.join(', ');
  }

  public parseUsdThresholdValue(rawValue: string): number {
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

  public parseCexFlowMode(rawValue: string): AlertCexFlowMode {
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

  public parseSmartFilterType(rawValue: string): AlertSmartFilterType {
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

  public parseDexFilterList(rawValue: string): readonly string[] {
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

  public parseQuietHours(rawWindow: string): {
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
    const quietFrom: string = rangeMatch?.groups?.['from'] ?? '';
    const quietTo: string = rangeMatch?.groups?.['to'] ?? '';

    if (!this.isValidTimeToken(quietFrom) || !this.isValidTimeToken(quietTo)) {
      throw new Error('Неверный формат quiet. Используй /quiet <HH:mm-HH:mm|off>.');
    }

    return {
      quietFrom,
      quietTo,
    };
  }

  public parseTimezone(rawTimezone: string): string {
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

  public parseMuteUntil(rawMinutes: string): Date | null {
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

    return minutes === 0 ? null : new Date(Date.now() + minutes * MINUTES_TO_MS);
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

      if (normalizedDex !== null && !normalizedDexes.includes(normalizedDex)) {
        normalizedDexes.push(normalizedDex);
      }
    }

    return normalizedDexes;
  }
}
