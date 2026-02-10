import type { EventDirection, ClassifiedEventType } from '../../chain/chain.types';

export enum AlertSmartFilterType {
  ALL = 'all',
  BUY = 'buy',
  SELL = 'sell',
  TRANSFER = 'transfer',
}

export interface AlertSemanticFilterPolicy {
  readonly type: AlertSmartFilterType;
  readonly includeDexes: readonly string[];
  readonly excludeDexes: readonly string[];
}

export interface AlertSemanticEventContext {
  readonly eventType: ClassifiedEventType;
  readonly direction: EventDirection;
  readonly dex: string | null;
}

export interface SemanticFilterDecision {
  readonly allowed: boolean;
  readonly suppressedReason: string | null;
  readonly normalizedDex: string | null;
}
