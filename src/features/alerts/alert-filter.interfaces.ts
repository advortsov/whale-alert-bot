export interface AlertFilterPolicy {
  readonly thresholdUsd: number;
  readonly minAmountUsd: number;
}

export interface ThresholdDecision {
  readonly allowed: boolean;
  readonly suppressedReason: string | null;
  readonly usdAmount: number | null;
  readonly usdUnavailable: boolean;
}

export interface QuietHoursDecision {
  readonly suppressed: boolean;
  readonly reason: string | null;
}
