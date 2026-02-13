export interface IAlertFilterPolicy {
  readonly thresholdUsd: number;
  readonly minAmountUsd: number;
}

export interface IThresholdDecision {
  readonly allowed: boolean;
  readonly suppressedReason: string | null;
  readonly usdAmount: number | null;
  readonly usdUnavailable: boolean;
}

export interface IQuietHoursDecision {
  readonly suppressed: boolean;
  readonly reason: string | null;
}
