import { Injectable } from '@nestjs/common';

import {
  GlobalDexFilterMode,
  type IGlobalFiltersCallbackPayload,
} from './telegram-global-filters-callback.interfaces';
import {
  FILTER_TOGGLE_PARTS_COUNT,
  GLOBAL_FILTERS_MODE_CALLBACK_PREFIX,
  GLOBAL_FILTERS_REFRESH_CALLBACK_VALUE,
  GLOBAL_FILTERS_RESET_CALLBACK_PREFIX,
  GLOBAL_FILTERS_TOGGLE_CALLBACK_PREFIX,
} from './telegram.constants';
import { WalletCallbackAction, type WalletCallbackTarget } from './telegram.interfaces';

@Injectable()
export class TelegramGlobalFiltersCallbackParserService {
  public parse(callbackData: string): WalletCallbackTarget | null {
    if (callbackData === GLOBAL_FILTERS_REFRESH_CALLBACK_VALUE) {
      return this.buildGlobalFiltersTarget(WalletCallbackAction.GLOBAL_FILTERS, {
        mode: GlobalDexFilterMode.INCLUDE,
        dexKey: null,
        enabled: null,
        isReset: false,
      });
    }

    const modeTarget: WalletCallbackTarget | null = this.parseModeTarget(callbackData);
    if (modeTarget !== null) {
      return modeTarget;
    }

    const resetTarget: WalletCallbackTarget | null = this.parseResetTarget(callbackData);
    if (resetTarget !== null) {
      return resetTarget;
    }

    return this.parseToggleTarget(callbackData);
  }

  private parseModeTarget(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(GLOBAL_FILTERS_MODE_CALLBACK_PREFIX)) {
      return null;
    }

    const modeToken: string = callbackData.slice(GLOBAL_FILTERS_MODE_CALLBACK_PREFIX.length);
    const mode: GlobalDexFilterMode | null = this.parseGlobalDexMode(modeToken);
    if (mode === null) {
      return null;
    }

    return this.buildGlobalFiltersTarget(WalletCallbackAction.GLOBAL_FILTERS_DEX_MODE, {
      mode,
      dexKey: null,
      enabled: null,
      isReset: false,
    });
  }

  private parseResetTarget(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(GLOBAL_FILTERS_RESET_CALLBACK_PREFIX)) {
      return null;
    }

    const modeToken: string = callbackData.slice(GLOBAL_FILTERS_RESET_CALLBACK_PREFIX.length);
    const mode: GlobalDexFilterMode | null = this.parseGlobalDexMode(modeToken);
    if (mode === null) {
      return null;
    }

    return this.buildGlobalFiltersTarget(WalletCallbackAction.GLOBAL_FILTERS_DEX_TOGGLE, {
      mode,
      dexKey: null,
      enabled: null,
      isReset: true,
    });
  }

  private parseToggleTarget(callbackData: string): WalletCallbackTarget | null {
    if (!callbackData.startsWith(GLOBAL_FILTERS_TOGGLE_CALLBACK_PREFIX)) {
      return null;
    }

    const rawPayload: string = callbackData.slice(GLOBAL_FILTERS_TOGGLE_CALLBACK_PREFIX.length);
    const payloadParts: readonly string[] = rawPayload.split(':');

    if (payloadParts.length !== FILTER_TOGGLE_PARTS_COUNT) {
      return null;
    }

    const mode: GlobalDexFilterMode | null = this.parseGlobalDexMode(payloadParts[0] ?? '');
    const dexKeyRaw: string = (payloadParts[1] ?? '').trim().toLowerCase();
    const enabled: boolean | null = this.parseOnOffState(payloadParts[2] ?? '');

    if (mode === null || dexKeyRaw.length === 0 || enabled === null) {
      return null;
    }

    return this.buildGlobalFiltersTarget(WalletCallbackAction.GLOBAL_FILTERS_DEX_TOGGLE, {
      mode,
      dexKey: dexKeyRaw,
      enabled,
      isReset: false,
    });
  }

  private parseGlobalDexMode(rawValue: string): GlobalDexFilterMode | null {
    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (normalizedValue === 'include') {
      return GlobalDexFilterMode.INCLUDE;
    }

    if (normalizedValue === 'exclude') {
      return GlobalDexFilterMode.EXCLUDE;
    }

    return null;
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

  private buildGlobalFiltersTarget(
    action: WalletCallbackAction,
    globalFilters: IGlobalFiltersCallbackPayload,
  ): WalletCallbackTarget {
    return {
      action,
      walletId: null,
      muteMinutes: null,
      historyOffset: null,
      historyLimit: null,
      historyKind: null,
      historyDirection: null,
      filterTarget: null,
      filterEnabled: null,
      globalFilters,
    };
  }
}
