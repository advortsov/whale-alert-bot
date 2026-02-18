export enum AlertSuppressionReason {
  MIN_INTERVAL = 'min_interval',
  ZERO_AMOUNT = 'zero_amount',
}

export interface IAlertMessageContext {
  readonly usdAmount: number | null;
  readonly usdUnavailable: boolean;
}

export type AlertSuppressionDecision = {
  readonly suppressed: boolean;
  readonly reason: AlertSuppressionReason | null;
};
