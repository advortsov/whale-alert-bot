import type { IAlertMessageContext } from './alert.interfaces';

export interface IEventUsdContext {
  readonly usdAmount: number | null;
  readonly usdUnavailable: boolean;
}

export interface IDispatchDecision {
  readonly skip: boolean;
  readonly reason: string | null;
  readonly messageContext: IAlertMessageContext;
}
