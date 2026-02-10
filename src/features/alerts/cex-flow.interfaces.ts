import type { ClassifiedEventType, EventDirection } from '../../chain/chain.types';

export enum AlertCexFlowMode {
  OFF = 'off',
  IN = 'in',
  OUT = 'out',
  ALL = 'all',
}

export interface AlertCexFlowPolicy {
  readonly mode: AlertCexFlowMode;
}

export interface AlertCexFlowContext {
  readonly eventType: ClassifiedEventType;
  readonly direction: EventDirection;
  readonly counterpartyTag: string | null;
}

export interface AlertCexFlowDecision {
  readonly allowed: boolean;
  readonly suppressedReason: string | null;
}
