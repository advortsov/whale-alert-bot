import { Injectable } from '@nestjs/common';

import { TrackingHistoryService } from './tracking-history.service';
import { TrackingSettingsService } from './tracking-settings.service';
import { TrackingWalletsService } from './tracking-wallets.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { HistoryPageResult } from '../entities/history-page.interfaces';
import type {
  ITrackingHistoryPageRequestDto,
  ITrackingHistoryRequestDto,
} from '../entities/tracking-history-request.dto';
import {
  AlertFilterToggleTarget,
  type TelegramUserRef,
  type TrackedWalletOption,
  type WalletAlertFilterState,
} from '../entities/tracking.interfaces';

@Injectable()
export class TrackingService {
  public constructor(
    private readonly walletsService: TrackingWalletsService,
    private readonly settingsService: TrackingSettingsService,
    private readonly historyService: TrackingHistoryService,
  ) {}

  public async trackAddress(
    userRef: TelegramUserRef,
    rawAddress: string,
    label: string | null,
    chainKey: ChainKey = ChainKey.ETHEREUM_MAINNET,
  ): Promise<string> {
    return this.walletsService.trackAddress(userRef, rawAddress, label, chainKey);
  }

  public async listTrackedAddresses(userRef: TelegramUserRef): Promise<string> {
    return this.walletsService.listTrackedAddresses(userRef);
  }

  public async listTrackedWalletOptions(
    userRef: TelegramUserRef,
  ): Promise<readonly TrackedWalletOption[]> {
    return this.walletsService.listTrackedWalletOptions(userRef);
  }

  public async getWalletDetails(userRef: TelegramUserRef, rawWalletId: string): Promise<string> {
    return this.walletsService.getWalletDetails(userRef, rawWalletId);
  }

  public async untrackAddress(userRef: TelegramUserRef, rawIdentifier: string): Promise<string> {
    return this.walletsService.untrackAddress(userRef, rawIdentifier);
  }

  public async getUserAlertFilters(userRef: TelegramUserRef): Promise<string> {
    return this.settingsService.getUserAlertFilters(userRef);
  }

  public async setMuteAlerts(userRef: TelegramUserRef, rawMinutes: string): Promise<string> {
    return this.settingsService.setMuteAlerts(userRef, rawMinutes);
  }

  public async setThresholdUsd(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    return this.settingsService.setThresholdUsd(userRef, rawValue);
  }

  public async setMinAmountUsd(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    return this.settingsService.setMinAmountUsd(userRef, rawValue);
  }

  public async setCexFlowFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    return this.settingsService.setCexFlowFilter(userRef, rawValue);
  }

  public async setSmartFilterType(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    return this.settingsService.setSmartFilterType(userRef, rawValue);
  }

  public async setIncludeDexFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    return this.settingsService.setIncludeDexFilter(userRef, rawValue);
  }

  public async setExcludeDexFilter(userRef: TelegramUserRef, rawValue: string): Promise<string> {
    return this.settingsService.setExcludeDexFilter(userRef, rawValue);
  }

  public async setQuietHours(userRef: TelegramUserRef, rawWindow: string): Promise<string> {
    return this.settingsService.setQuietHours(userRef, rawWindow);
  }

  public async setUserTimezone(userRef: TelegramUserRef, rawTimezone: string): Promise<string> {
    return this.settingsService.setUserTimezone(userRef, rawTimezone);
  }

  public async muteWalletAlertsForDuration(
    userRef: TelegramUserRef,
    rawWalletId: string,
    muteMinutes: number,
    source: string,
  ): Promise<string> {
    return this.walletsService.muteWalletAlertsForDuration(
      userRef,
      rawWalletId,
      muteMinutes,
      source,
    );
  }

  public async setEventTypeFilter(
    userRef: TelegramUserRef,
    target: AlertFilterToggleTarget,
    enabled: boolean,
  ): Promise<string> {
    return this.settingsService.setEventTypeFilter(userRef, target, enabled);
  }

  public async getWalletAlertFilterState(
    userRef: TelegramUserRef,
    rawWalletId: string,
  ): Promise<WalletAlertFilterState> {
    return this.walletsService.getWalletAlertFilterState(userRef, rawWalletId);
  }

  public async setWalletEventTypeFilter(
    userRef: TelegramUserRef,
    rawWalletId: string,
    target: AlertFilterToggleTarget,
    enabled: boolean,
  ): Promise<WalletAlertFilterState> {
    return this.walletsService.setWalletEventTypeFilter(userRef, rawWalletId, target, enabled);
  }

  public async getUserStatus(userRef: TelegramUserRef): Promise<string> {
    return this.settingsService.getUserStatus(userRef);
  }

  public async getAddressHistory(
    userRef: TelegramUserRef,
    request: Omit<ITrackingHistoryRequestDto, 'source'>,
  ): Promise<string> {
    return this.historyService.getAddressHistory(userRef, request);
  }

  public async getAddressHistoryPageWithPolicy(
    userRef: TelegramUserRef,
    request: ITrackingHistoryPageRequestDto,
  ): Promise<HistoryPageResult> {
    return this.historyService.getAddressHistoryPageWithPolicy(userRef, request);
  }

  public async getAddressHistoryWithPolicy(
    userRef: TelegramUserRef,
    request: ITrackingHistoryRequestDto,
  ): Promise<string> {
    return this.historyService.getAddressHistoryWithPolicy(userRef, request);
  }
}
