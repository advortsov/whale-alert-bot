import type { EventDirection, ClassifiedEventType } from '../../common/interfaces/chain.types';

export enum AlertSmartFilterType {
  ALL = 'all',
  BUY = 'buy',
  SELL = 'sell',
  TRANSFER = 'transfer',
}

export interface IAlertSemanticFilterPolicy {
  readonly type: AlertSmartFilterType;
  readonly includeDexes: readonly string[];
  readonly excludeDexes: readonly string[];
}

export interface IAlertSemanticEventContext {
  readonly eventType: ClassifiedEventType;
  readonly direction: EventDirection;
  readonly dex: string | null;
}

export interface ISemanticFilterDecision {
  readonly allowed: boolean;
  readonly suppressedReason: string | null;
  readonly normalizedDex: string | null;
}
