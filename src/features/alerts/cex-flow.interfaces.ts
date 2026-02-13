import type { ClassifiedEventType, EventDirection } from '../../chain/chain.types';

export enum AlertCexFlowMode {
  OFF = 'off',
  IN = 'in',
  OUT = 'out',
  ALL = 'all',
}

export interface IAlertCexFlowPolicy {
  readonly mode: AlertCexFlowMode;
}

export interface IAlertCexFlowContext {
  readonly eventType: ClassifiedEventType;
  readonly direction: EventDirection;
  readonly counterpartyTag: string | null;
}

export interface IAlertCexFlowDecision {
  readonly allowed: boolean;
  readonly suppressedReason: string | null;
}
