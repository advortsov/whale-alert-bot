import { Inject, Injectable } from '@nestjs/common';

import { GlobalDexFilterMode } from './telegram-global-filters-callback.interfaces';
import { TelegramGlobalFiltersUiService } from './telegram-global-filters-ui.service';
import { TelegramUiService } from './telegram-ui.service';
import {
  CALLBACK_HISTORY_LIMIT,
  DEFAULT_MUTE_MINUTES,
  MUTE_24H_MINUTES,
} from './telegram.constants';
import {
  WalletCallbackAction,
  WalletCallbackFilterTarget,
  type CommandExecutionResult,
  type WalletCallbackTarget,
} from './telegram.interfaces';
import type { HistoryPageResult } from '../../whales/entities/history-page.interfaces';
import { HistoryRequestSource } from '../../whales/entities/history-rate-limiter.interfaces';
import {
  AlertFilterToggleTarget,
  type TelegramUserRef,
  type WalletAlertFilterState,
} from '../../whales/entities/tracking.interfaces';
import type { IUserSettingsResult } from '../../whales/interfaces/tracking-settings.result';
import { TrackingService } from '../../whales/services/tracking.service';

@Injectable()
export class TelegramCallbackCommandsServiceDependencies {
  @Inject(TrackingService)
  public readonly trackingService!: TrackingService;

  @Inject(TelegramUiService)
  public readonly uiService!: TelegramUiService;

  @Inject(TelegramGlobalFiltersUiService)
  public readonly globalFiltersUiService!: TelegramGlobalFiltersUiService;
}

@Injectable()
export class TelegramCallbackCommandsService {
  public constructor(private readonly deps: TelegramCallbackCommandsServiceDependencies) {}

  public async executeWalletCallbackAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const handlers: Partial<
      Record<
        WalletCallbackAction,
        (target: WalletCallbackTarget) => Promise<CommandExecutionResult>
      >
    > = {
      [WalletCallbackAction.MENU]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeWalletMenuAction(userRef, target),
      [WalletCallbackAction.HISTORY]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeWalletHistoryAction(userRef, target),
      [WalletCallbackAction.UNTRACK]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeWalletUntrackAction(userRef, target),
      [WalletCallbackAction.MUTE]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeWalletMuteAction(userRef, target),
      [WalletCallbackAction.IGNORE_24H]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeWalletIgnoreAction(userRef, target),
      [WalletCallbackAction.FILTERS]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeWalletFiltersAction(userRef, target),
      [WalletCallbackAction.GLOBAL_FILTERS]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeGlobalFiltersAction(userRef, target),
      [WalletCallbackAction.GLOBAL_FILTERS_DEX_MODE]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeGlobalFiltersAction(userRef, target),
      [WalletCallbackAction.GLOBAL_FILTERS_DEX_TOGGLE]: async (
        target: WalletCallbackTarget,
      ): Promise<CommandExecutionResult> => this.executeGlobalFiltersToggleAction(userRef, target),
    };

    const handler = handlers[callbackTarget.action];

    if (handler === undefined) {
      throw new Error('Неизвестное callback действие.');
    }

    return handler(callbackTarget);
  }

  private async executeWalletMenuAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const walletId: number = this.assertWalletId(
      callbackTarget,
      'Callback не содержит id кошелька.',
    );
    const message: string = await this.deps.trackingService.getWalletDetails(
      userRef,
      `#${walletId}`,
    );

    return {
      lineNumber: 1,
      message,
      replyOptions: this.deps.uiService.buildWalletActionInlineKeyboard(walletId),
    };
  }

  private async executeWalletHistoryAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const walletId: number = this.assertWalletId(
      callbackTarget,
      'Callback не содержит id кошелька для истории.',
    );
    const historyOffset: number = callbackTarget.historyOffset ?? 0;
    const historyLimit: number = callbackTarget.historyLimit ?? CALLBACK_HISTORY_LIMIT;
    const historyPage: HistoryPageResult =
      await this.deps.trackingService.getAddressHistoryPageWithPolicy(userRef, {
        rawAddress: `#${walletId}`,
        rawLimit: String(historyLimit),
        rawOffset: String(historyOffset),
        source: HistoryRequestSource.CALLBACK,
        rawKind: callbackTarget.historyKind,
        rawDirection: callbackTarget.historyDirection,
      });

    return {
      lineNumber: 1,
      message: historyPage.message,
      replyOptions: this.deps.uiService.buildHistoryActionInlineKeyboard(historyPage),
    };
  }

  private async executeWalletUntrackAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const walletId: number = this.assertWalletId(
      callbackTarget,
      'Callback не содержит id кошелька.',
    );
    const message: string = await this.deps.trackingService.untrackAddress(userRef, `#${walletId}`);

    return {
      lineNumber: 1,
      message,
      replyOptions: null,
    };
  }

  private async executeWalletMuteAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const muteMinutes: number = callbackTarget.muteMinutes ?? DEFAULT_MUTE_MINUTES;
    const message: string = await this.deps.trackingService.setMuteAlerts(
      userRef,
      String(muteMinutes),
    );

    return {
      lineNumber: 1,
      message,
      replyOptions: null,
    };
  }

  private async executeWalletIgnoreAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const walletId: number = this.assertWalletId(
      callbackTarget,
      'Callback не содержит id кошелька.',
    );
    const message: string = await this.deps.trackingService.muteWalletAlertsForDuration(
      userRef,
      `#${String(walletId)}`,
      MUTE_24H_MINUTES,
      'alert_button',
    );

    return {
      lineNumber: 1,
      message,
      replyOptions: null,
    };
  }

  private async executeWalletFiltersAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const walletId: number = this.assertWalletId(
      callbackTarget,
      'Callback не содержит id кошелька для фильтров.',
    );

    let walletFilterState: WalletAlertFilterState;

    if (callbackTarget.filterTarget !== null && callbackTarget.filterEnabled !== null) {
      const target: AlertFilterToggleTarget =
        callbackTarget.filterTarget === WalletCallbackFilterTarget.TRANSFER
          ? AlertFilterToggleTarget.TRANSFER
          : AlertFilterToggleTarget.SWAP;
      walletFilterState = await this.deps.trackingService.setWalletEventTypeFilter(
        userRef,
        `#${walletId}`,
        target,
        callbackTarget.filterEnabled,
      );
    } else {
      walletFilterState = await this.deps.trackingService.getWalletAlertFilterState(
        userRef,
        `#${walletId}`,
      );
    }

    return {
      lineNumber: 1,
      message: this.deps.uiService.formatWalletFiltersMessage(walletFilterState),
      replyOptions: this.deps.uiService.buildWalletFiltersInlineKeyboard(walletFilterState),
    };
  }

  private async executeGlobalFiltersAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const mode: GlobalDexFilterMode =
      callbackTarget.globalFilters?.mode ?? GlobalDexFilterMode.INCLUDE;
    const settingsResult: IUserSettingsResult =
      await this.deps.trackingService.getSettings(userRef);

    return {
      lineNumber: 1,
      message: this.deps.globalFiltersUiService.formatGlobalDexFiltersMessage(settingsResult, mode),
      replyOptions: this.deps.globalFiltersUiService.buildGlobalDexFiltersInlineKeyboard(
        settingsResult,
        mode,
      ),
    };
  }

  private async executeGlobalFiltersToggleAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    const payload = callbackTarget.globalFilters;

    if (payload === null) {
      throw new Error('Callback global filters payload is missing.');
    }

    const currentSettings: IUserSettingsResult =
      await this.deps.trackingService.getSettings(userRef);
    const includeDexes: string[] = [...currentSettings.settings.includeDexes];
    const excludeDexes: string[] = [...currentSettings.settings.excludeDexes];
    const isIncludeMode: boolean = payload.mode === GlobalDexFilterMode.INCLUDE;

    if (payload.isReset) {
      if (isIncludeMode) {
        await this.deps.trackingService.setIncludeDexFilter(userRef, 'off');
      } else {
        await this.deps.trackingService.setExcludeDexFilter(userRef, 'off');
      }
    } else {
      const dexKey: string = payload.dexKey ?? '';

      if (dexKey.length === 0 || payload.enabled === null) {
        throw new Error('Callback global filters payload is invalid.');
      }

      if (isIncludeMode) {
        this.applyDexToggle(includeDexes, dexKey, payload.enabled);
        this.applyDexToggle(excludeDexes, dexKey, false);
      } else {
        this.applyDexToggle(excludeDexes, dexKey, payload.enabled);
        this.applyDexToggle(includeDexes, dexKey, false);
      }

      await this.deps.trackingService.setIncludeDexFilter(
        userRef,
        includeDexes.length > 0 ? includeDexes.join(',') : 'off',
      );
      await this.deps.trackingService.setExcludeDexFilter(
        userRef,
        excludeDexes.length > 0 ? excludeDexes.join(',') : 'off',
      );
    }

    const nextSettings: IUserSettingsResult = await this.deps.trackingService.getSettings(userRef);

    return {
      lineNumber: 1,
      message: this.deps.globalFiltersUiService.formatGlobalDexFiltersMessage(
        nextSettings,
        payload.mode,
      ),
      replyOptions: this.deps.globalFiltersUiService.buildGlobalDexFiltersInlineKeyboard(
        nextSettings,
        payload.mode,
      ),
    };
  }

  private applyDexToggle(dexes: string[], dexKey: string, enabled: boolean): void {
    const index: number = dexes.indexOf(dexKey);

    if (enabled && index === -1) {
      dexes.push(dexKey);
      return;
    }

    if (!enabled && index !== -1) {
      dexes.splice(index, 1);
    }
  }

  private assertWalletId(callbackTarget: WalletCallbackTarget, errorMessage: string): number {
    if (callbackTarget.walletId === null) {
      throw new Error(errorMessage);
    }

    return callbackTarget.walletId;
  }
}
