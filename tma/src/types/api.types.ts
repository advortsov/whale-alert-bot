export interface ITokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface IWalletSummaryDto {
  readonly walletId: number;
  readonly chainKey: string;
  readonly address: string;
  readonly label: string | null;
  readonly createdAt: string;
}

export interface IWalletListResult {
  readonly wallets: readonly IWalletSummaryDto[];
  readonly totalCount: number;
}

export interface IUserAlertPreferencesDto {
  readonly minAmount: number;
  readonly allowTransfer: boolean;
  readonly allowSwap: boolean;
  readonly mutedUntil: string | null;
}

export interface IUserAlertSettingsDto {
  readonly thresholdUsd: number;
  readonly minAmountUsd: number;
  readonly cexFlowMode: string;
  readonly smartFilterType: string;
  readonly includeDexes: readonly string[];
  readonly excludeDexes: readonly string[];
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
  readonly timezone: string;
}

export interface IUserSettingsResult {
  readonly preferences: IUserAlertPreferencesDto;
  readonly settings: IUserAlertSettingsDto;
}

export interface ITmaInitResult {
  readonly wallets: IWalletListResult;
  readonly settings: IUserSettingsResult;
  readonly todayAlertCount: number;
}

export interface IWalletDetailDto {
  readonly walletId: number;
  readonly chainKey: string;
  readonly address: string;
  readonly label: string | null;
  readonly activeMute: string | null;
}

export interface IWalletHistoryItem {
  readonly txHash: string;
  readonly occurredAt: string;
  readonly eventType: string;
  readonly direction: string;
  readonly amountText: string;
  readonly txUrl: string;
  readonly assetSymbol: string | null;
  readonly chainKey: string;
  readonly txType: string;
  readonly flowType: string;
  readonly flowLabel: string;
  readonly assetStandard: string;
  readonly dex: string | null;
  readonly pair: string | null;
  readonly isError: boolean;
  readonly counterpartyAddress: string | null;
  readonly contractAddress: string | null;
}

export interface IWalletHistoryResult {
  readonly items: readonly IWalletHistoryItem[];
  readonly nextOffset: number | null;
}

export interface ITrackWalletResult {
  readonly walletId: number;
  readonly address: string;
  readonly label: string | null;
  readonly chainKey: string;
  readonly isNewSubscription: boolean;
}

export interface IMuteWalletResult {
  readonly walletId: number;
  readonly mutedUntil: string;
}

export interface IUnmuteWalletResult {
  readonly walletId: number;
  readonly mutedUntil: null;
}

export interface ITrackWalletRequest {
  readonly chainKey: string;
  readonly address: string;
  readonly label: string;
}

export interface IUpdateSettingsRequest {
  readonly thresholdUsd?: number;
  readonly mutedMinutes?: number | null;
  readonly cexFlowMode?: string;
  readonly smartFilterType?: string;
  readonly includeDexes?: readonly string[];
  readonly excludeDexes?: readonly string[];
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
  readonly timezone: string;
  readonly allowTransfer: boolean;
  readonly allowSwap: boolean;
}
