export interface ITokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface IWalletItem {
  readonly id: number;
  readonly chainKey: string;
  readonly address: string;
  readonly label: string | null;
  readonly mutedUntil: string | null;
}

export interface IWalletListResult {
  readonly wallets: readonly IWalletItem[];
}

export interface IUserSettingsResult {
  readonly thresholdUsd: number | null;
  readonly minAmountUsd: number | null;
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
  readonly timezone: string;
  readonly cexFlowMode: string;
  readonly transferEnabled: boolean;
  readonly swapEnabled: boolean;
}

export interface ITmaInitResult {
  readonly wallets: IWalletListResult;
  readonly settings: IUserSettingsResult;
  readonly todayAlertCount: number;
}

export interface IWalletHistoryItem {
  readonly txHash: string;
  readonly occurredAt: string;
  readonly eventType: string;
  readonly direction: string;
  readonly amountText: string;
}

export interface IWalletHistoryResult {
  readonly items: readonly IWalletHistoryItem[];
  readonly nextOffset: number | null;
}

export interface ITrackWalletRequest {
  readonly chainKey: string;
  readonly address: string;
  readonly label: string;
}

export interface IUpdateSettingsRequest {
  readonly thresholdUsd: number | null;
  readonly minAmountUsd: number | null;
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
  readonly timezone: string;
  readonly cexFlowMode: string;
  readonly transferEnabled: boolean;
  readonly swapEnabled: boolean;
}
