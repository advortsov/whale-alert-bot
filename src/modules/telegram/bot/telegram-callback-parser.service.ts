import { Injectable } from '@nestjs/common';

import { TelegramGlobalFiltersCallbackParserService } from './telegram-global-filters-callback-parser.service';
import {
  ALERT_IGNORE_CALLBACK_PREFIX,
  CALLBACK_HISTORY_LIMIT,
  MUTE_24H_MINUTES,
  FILTER_TOGGLE_PARTS_COUNT,
  HISTORY_BUTTON_EXTENDED_PARTS_COUNT,
  HISTORY_BUTTON_MIN_PARTS_COUNT,
  HISTORY_NAV_EXTENDED_PARTS_COUNT,
  HISTORY_NAV_MIN_PARTS_COUNT,
  WALLET_FILTERS_CALLBACK_PREFIX,
  WALLET_FILTER_TOGGLE_CALLBACK_PREFIX,
  WALLET_FILTER_TARGET_MAP,
  WALLET_HISTORY_CALLBACK_PREFIX,
  WALLET_HISTORY_PAGE_CALLBACK_PREFIX,
  WALLET_HISTORY_REFRESH_CALLBACK_PREFIX,
  WALLET_MENU_CALLBACK_PREFIX,
  WALLET_MUTE_CALLBACK_PREFIX,
  WALLET_UNTRACK_CALLBACK_PREFIX,
} from './telegram.constants';
import { WalletCallbackAction, type WalletCallbackTarget } from './telegram.interfaces';
import { HistoryDirectionFilter, HistoryKind } from '../../whales/entities/history-request.dto';

@Injectable()
export class TelegramCallbackParserService {
  public constructor(
    private readonly globalFiltersCallbackParserService: TelegramGlobalFiltersCallbackParserService,
  ) {}

  public parseWalletCallbackData(callbackData: string): WalletCallbackTarget | null {
    const parserResults: readonly (WalletCallbackTarget | null)[] = [
      this.parseSimpleWalletAction(callbackData),
      this.parseMuteAction(callbackData),
      this.parseIgnoreAction(callbackData),
      this.parseWalletFilterToggleAction(callbackData),
      this.parseWalletFiltersAction(callbackData),
      this.globalFiltersCallbackParserService.parse(callbackData),
      this.parseWalletHistoryPageAction(callbackData),
      this.parseWalletHistoryRefreshAction(callbackData),
      this.parseWalletHistoryAction(callbackData),
    ];

    for (const parsedTarget of parserResults) {
      if (parsedTarget !== null) {
        return parsedTarget;
      }
    }

    return null;
  }

  private parseSimpleWalletAction(callbackData: string): WalletCallbackTarget | null {
    const actionMap: readonly {
      readonly prefix: string;
      readonly action: WalletCallbackAction;
    }[] = [
      { prefix: WALLET_MENU_CALLBACK_PREFIX, action: WalletCallbackAction.MENU },
      { prefix: WALLET_UNTRACK_CALLBACK_PREFIX, action: WalletCallbackAction.UNTRACK },
      { prefix: WALLET_HISTORY_CALLBACK_PREFIX, action: WalletCallbackAction.HISTORY },
    ];

    for (const actionEntry of actionMap) {
      if (!callbackData.startsWith(actionEntry.prefix)) {
        continue;
      }

      const walletId: number | null = this.parseWalletId(
        callbackData.slice(actionEntry.prefix.length),
      );

      if (walletId === null) {
        return null;
      }

      return {
        action: actionEntry.action,
        walletId,
        muteMinutes: null,
        historyOffset: actionEntry.action === WalletCallbackAction.HISTORY ? 0 : null,
        historyLimit:
          actionEntry.action === WalletCallbackAction.HISTORY ? CALLBACK_HISTORY_LIMIT : null,
        historyKind: actionEntry.action === WalletCallbackAction.HISTORY ? HistoryKind.ALL : null,
        historyDirection:
          actionEntry.action === WalletCallbackAction.HISTORY ? HistoryDirectionFilter.ALL : null,
        filterTarget: null,
        filterEnabled: null,
        globalFilters: null,
      };
    }

    return null;
  }

  private parseMuteAction(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(WALLET_MUTE_CALLBACK_PREFIX)) {
      return null;
    }

    const rawMinutes: string = callbackData.slice(WALLET_MUTE_CALLBACK_PREFIX.length);

    if (!/^\d+$/.test(rawMinutes)) {
      return null;
    }

    return {
      action: WalletCallbackAction.MUTE,
      walletId: null,
      muteMinutes: Number.parseInt(rawMinutes, 10),
      historyOffset: null,
      historyLimit: null,
      historyKind: null,
      historyDirection: null,
      filterTarget: null,
      filterEnabled: null,
      globalFilters: null,
    };
  }

  private parseIgnoreAction(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(ALERT_IGNORE_CALLBACK_PREFIX)) {
      return null;
    }

    const walletId: number | null = this.parseWalletId(
      callbackData.slice(ALERT_IGNORE_CALLBACK_PREFIX.length),
    );

    if (walletId === null) {
      return null;
    }

    return {
      action: WalletCallbackAction.IGNORE_24H,
      walletId,
      muteMinutes: MUTE_24H_MINUTES,
      historyOffset: null,
      historyLimit: null,
      historyKind: null,
      historyDirection: null,
      filterTarget: null,
      filterEnabled: null,
      globalFilters: null,
    };
  }

  private parseWalletFilterToggleAction(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(WALLET_FILTER_TOGGLE_CALLBACK_PREFIX)) {
      return null;
    }

    const rawPayload: string = callbackData.slice(WALLET_FILTER_TOGGLE_CALLBACK_PREFIX.length);
    const payloadParts: readonly string[] = rawPayload.split(':');

    if (payloadParts.length !== FILTER_TOGGLE_PARTS_COUNT) {
      return null;
    }

    const walletId: number | null = this.parseWalletId(payloadParts[0] ?? '');
    const rawFilterTarget: string = payloadParts[1] ?? '';
    const rawState: string = payloadParts[2] ?? '';
    const filterTarget = WALLET_FILTER_TARGET_MAP[rawFilterTarget.trim().toLowerCase()] ?? null;
    const filterEnabled: boolean | null = this.parseOnOffState(rawState);

    if (walletId === null || filterTarget === null || filterEnabled === null) {
      return null;
    }

    return {
      action: WalletCallbackAction.FILTERS,
      walletId,
      muteMinutes: null,
      historyOffset: null,
      historyLimit: null,
      historyKind: null,
      historyDirection: null,
      filterTarget,
      filterEnabled,
      globalFilters: null,
    };
  }

  private parseWalletFiltersAction(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(WALLET_FILTERS_CALLBACK_PREFIX)) {
      return null;
    }

    const walletId: number | null = this.parseWalletId(
      callbackData.slice(WALLET_FILTERS_CALLBACK_PREFIX.length),
    );

    if (walletId === null) {
      return null;
    }

    return {
      action: WalletCallbackAction.FILTERS,
      walletId,
      muteMinutes: null,
      historyOffset: null,
      historyLimit: null,
      historyKind: null,
      historyDirection: null,
      filterTarget: null,
      filterEnabled: null,
      globalFilters: null,
    };
  }
  private parseWalletHistoryPageAction(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(WALLET_HISTORY_PAGE_CALLBACK_PREFIX)) {
      return null;
    }

    const payloadParts: readonly string[] = callbackData
      .slice(WALLET_HISTORY_PAGE_CALLBACK_PREFIX.length)
      .split(':');
    const parsedPayload = this.parseHistoryPagePayload(payloadParts);

    if (parsedPayload === null) {
      return null;
    }

    return {
      action: WalletCallbackAction.HISTORY,
      walletId: parsedPayload.walletId,
      muteMinutes: null,
      historyOffset: parsedPayload.historyOffset,
      historyLimit: parsedPayload.historyLimit,
      historyKind: parsedPayload.historyKind,
      historyDirection: parsedPayload.historyDirection,
      filterTarget: null,
      filterEnabled: null,
      globalFilters: null,
    };
  }

  private parseWalletHistoryRefreshAction(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(WALLET_HISTORY_REFRESH_CALLBACK_PREFIX)) {
      return null;
    }

    const payloadParts: readonly string[] = callbackData
      .slice(WALLET_HISTORY_REFRESH_CALLBACK_PREFIX.length)
      .split(':');

    if (
      payloadParts.length !== HISTORY_BUTTON_MIN_PARTS_COUNT &&
      payloadParts.length !== HISTORY_BUTTON_EXTENDED_PARTS_COUNT
    ) {
      return null;
    }

    const walletId: number | null = this.parseWalletId(payloadParts[0] ?? '');
    const historyLimit: number | null = this.parsePositiveNumber(payloadParts[1] ?? '');
    const historyKind: HistoryKind | null = this.parseHistoryKindToken(payloadParts[2]);
    const historyDirection: HistoryDirectionFilter | null = this.parseHistoryDirectionToken(
      payloadParts[3],
    );

    if (
      walletId === null ||
      historyLimit === null ||
      historyKind === null ||
      historyDirection === null
    ) {
      return null;
    }

    return {
      action: WalletCallbackAction.HISTORY,
      walletId,
      muteMinutes: null,
      historyOffset: 0,
      historyLimit,
      historyKind,
      historyDirection,
      filterTarget: null,
      filterEnabled: null,
      globalFilters: null,
    };
  }

  private parseWalletHistoryAction(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(WALLET_HISTORY_CALLBACK_PREFIX)) {
      return null;
    }

    const walletId: number | null = this.parseWalletId(
      callbackData.slice(WALLET_HISTORY_CALLBACK_PREFIX.length),
    );

    if (walletId === null) {
      return null;
    }

    return {
      action: WalletCallbackAction.HISTORY,
      walletId,
      muteMinutes: null,
      historyOffset: 0,
      historyLimit: CALLBACK_HISTORY_LIMIT,
      historyKind: HistoryKind.ALL,
      historyDirection: HistoryDirectionFilter.ALL,
      filterTarget: null,
      filterEnabled: null,
      globalFilters: null,
    };
  }

  private parseWalletId(rawWalletId: string): number | null {
    const normalizedWalletId: string = rawWalletId.trim().replace('#', '');

    if (!/^\d+$/.test(normalizedWalletId)) {
      return null;
    }

    return Number.parseInt(normalizedWalletId, 10);
  }

  private parseOnOffState(rawState: string): boolean | null {
    const normalizedState: string = rawState.trim().toLowerCase();

    if (normalizedState === 'on') {
      return true;
    }

    if (normalizedState === 'off') {
      return false;
    }

    return null;
  }

  private parseNonNegativeNumber(rawValue: string): number | null {
    const normalizedValue: string = rawValue.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      return null;
    }

    const parsedValue: number = Number.parseInt(normalizedValue, 10);
    return Number.isSafeInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null;
  }

  private parsePositiveNumber(rawValue: string): number | null {
    const parsedValue: number | null = this.parseNonNegativeNumber(rawValue);
    return parsedValue !== null && parsedValue > 0 ? parsedValue : null;
  }

  private parseHistoryKindToken(rawValue: string | undefined): HistoryKind | null {
    const normalizedValue: string = (rawValue ?? 'all').trim().toLowerCase();

    if (normalizedValue === 'all') {
      return HistoryKind.ALL;
    }

    if (normalizedValue === 'eth') {
      return HistoryKind.ETH;
    }

    if (normalizedValue === 'erc20') {
      return HistoryKind.ERC20;
    }

    return null;
  }

  private parseHistoryDirectionToken(rawValue: string | undefined): HistoryDirectionFilter | null {
    const normalizedValue: string = (rawValue ?? 'all').trim().toLowerCase();

    if (normalizedValue === 'all') {
      return HistoryDirectionFilter.ALL;
    }

    if (normalizedValue === 'in') {
      return HistoryDirectionFilter.IN;
    }

    if (normalizedValue === 'out') {
      return HistoryDirectionFilter.OUT;
    }

    return null;
  }

  private parseHistoryPagePayload(payloadParts: readonly string[]): {
    readonly walletId: number;
    readonly historyOffset: number;
    readonly historyLimit: number;
    readonly historyKind: HistoryKind;
    readonly historyDirection: HistoryDirectionFilter;
  } | null {
    const validLengths: readonly number[] = [
      HISTORY_NAV_MIN_PARTS_COUNT,
      HISTORY_NAV_EXTENDED_PARTS_COUNT,
    ];

    if (!validLengths.includes(payloadParts.length)) {
      return null;
    }

    const walletId: number | null = this.parseWalletId(payloadParts[0] ?? '');
    const historyOffset: number | null = this.parseNonNegativeNumber(payloadParts[1] ?? '');
    const historyLimit: number | null = this.parsePositiveNumber(payloadParts[2] ?? '');
    const historyKind: HistoryKind | null = this.parseHistoryKindToken(payloadParts[3]);
    const historyDirection: HistoryDirectionFilter | null = this.parseHistoryDirectionToken(
      payloadParts[4],
    );

    if (
      walletId === null ||
      historyOffset === null ||
      historyLimit === null ||
      historyKind === null ||
      historyDirection === null
    ) {
      return null;
    }

    return {
      walletId,
      historyOffset,
      historyLimit,
      historyKind,
      historyDirection,
    };
  }
}
