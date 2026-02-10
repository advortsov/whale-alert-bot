export enum AlertActionType {
  OPEN_CHART = 'open_chart',
  OPEN_TX = 'open_tx',
  OPEN_WALLET = 'open_wallet',
  IGNORE_24H = 'ignore_24h',
}

export interface AlertActionPayload {
  readonly action: AlertActionType;
  readonly walletId: number;
  readonly chainKey: string;
}

export interface IgnoreMuteRequestDto {
  readonly userId: number;
  readonly walletId: number;
  readonly chainKey: string;
  readonly source: string;
  readonly muteMinutes: number;
}
