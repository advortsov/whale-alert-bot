import type { ClassifiedEvent } from '../chain/chain.types';

export enum AlertSuppressionReason {
  MIN_INTERVAL = 'min_interval',
  ZERO_AMOUNT = 'zero_amount',
}

export type AlertPayload = {
  readonly event: ClassifiedEvent;
  readonly message: string;
};

export interface IAlertMessageContext {
  readonly usdAmount: number | null;
  readonly usdUnavailable: boolean;
}

export type AlertDeliveryResult = {
  readonly telegramId: string;
  readonly success: boolean;
  readonly errorMessage: string | null;
};

export type AlertSuppressionDecision = {
  readonly suppressed: boolean;
  readonly reason: AlertSuppressionReason | null;
};
