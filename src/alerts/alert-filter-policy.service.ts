import { Injectable } from '@nestjs/common';

import { ClassifiedEventType, EventDirection } from '../chain/chain.types';
import type {
  IAlertFilterPolicy,
  IThresholdDecision,
} from '../features/alerts/alert-filter.interfaces';
import type {
  IAlertCexFlowContext,
  IAlertCexFlowDecision,
  IAlertCexFlowPolicy,
} from '../features/alerts/cex-flow.interfaces';
import { AlertCexFlowMode } from '../features/alerts/cex-flow.interfaces';
import { normalizeDexKey } from '../features/alerts/dex-normalizer.util';
import type {
  IAlertSemanticEventContext,
  IAlertSemanticFilterPolicy,
  ISemanticFilterDecision,
} from '../features/alerts/smart-filter.interfaces';
import { AlertSmartFilterType } from '../features/alerts/smart-filter.interfaces';

@Injectable()
export class AlertFilterPolicyService {
  public evaluateUsdThreshold(
    policy: IAlertFilterPolicy,
    usdAmount: number | null,
    usdUnavailable: boolean,
  ): IThresholdDecision {
    const thresholdUsd: number = policy.thresholdUsd > 0 ? policy.thresholdUsd : 0;
    const legacyMinAmountUsd: number = policy.minAmountUsd > 0 ? policy.minAmountUsd : 0;
    const effectiveThresholdUsd: number = Math.max(thresholdUsd, legacyMinAmountUsd);

    if (effectiveThresholdUsd <= 0) {
      return {
        allowed: true,
        suppressedReason: null,
        usdAmount,
        usdUnavailable,
      };
    }

    if (usdUnavailable || usdAmount === null || Number.isNaN(usdAmount)) {
      return {
        allowed: true,
        suppressedReason: null,
        usdAmount: null,
        usdUnavailable: true,
      };
    }

    if (usdAmount < effectiveThresholdUsd) {
      return {
        allowed: false,
        suppressedReason: 'threshold_usd',
        usdAmount,
        usdUnavailable: false,
      };
    }

    return {
      allowed: true,
      suppressedReason: null,
      usdAmount,
      usdUnavailable: false,
    };
  }

  public evaluateSemanticFilters(
    policy: IAlertSemanticFilterPolicy,
    eventContext: IAlertSemanticEventContext,
  ): ISemanticFilterDecision {
    const normalizedDex: string | null = normalizeDexKey(eventContext.dex);
    const isTypeAllowed: boolean = this.isSemanticTypeAllowed(policy.type, eventContext);

    if (!isTypeAllowed) {
      return this.buildSemanticDecision(false, 'type_filter', normalizedDex);
    }

    const dexDecision: ISemanticFilterDecision | null = this.evaluateDexDecision(
      policy,
      eventContext,
      normalizedDex,
    );

    if (dexDecision !== null) {
      return dexDecision;
    }

    return this.buildSemanticDecision(true, null, normalizedDex);
  }

  public evaluateCexFlow(
    policy: IAlertCexFlowPolicy,
    context: IAlertCexFlowContext,
  ): IAlertCexFlowDecision {
    if (policy.mode === AlertCexFlowMode.OFF) {
      return {
        allowed: true,
        suppressedReason: null,
      };
    }

    if (context.eventType !== ClassifiedEventType.TRANSFER) {
      return {
        allowed: false,
        suppressedReason: 'cex_transfer_only',
      };
    }

    if (context.counterpartyTag === null) {
      return {
        allowed: false,
        suppressedReason: 'cex_not_matched',
      };
    }

    if (policy.mode === AlertCexFlowMode.IN && context.direction !== EventDirection.IN) {
      return {
        allowed: false,
        suppressedReason: 'cex_direction_in',
      };
    }

    if (policy.mode === AlertCexFlowMode.OUT && context.direction !== EventDirection.OUT) {
      return {
        allowed: false,
        suppressedReason: 'cex_direction_out',
      };
    }

    return {
      allowed: true,
      suppressedReason: null,
    };
  }

  private evaluateDexDecision(
    policy: IAlertSemanticFilterPolicy,
    eventContext: IAlertSemanticEventContext,
    normalizedDex: string | null,
  ): ISemanticFilterDecision | null {
    if (eventContext.eventType !== ClassifiedEventType.SWAP) {
      return null;
    }

    if (this.isDexExcluded(policy, normalizedDex)) {
      return this.buildSemanticDecision(false, 'dex_exclude', normalizedDex);
    }

    if (!this.isDexIncluded(policy, normalizedDex)) {
      return this.buildSemanticDecision(false, 'dex_include', normalizedDex);
    }

    return null;
  }

  private isDexIncluded(policy: IAlertSemanticFilterPolicy, normalizedDex: string | null): boolean {
    if (policy.includeDexes.length === 0) {
      return true;
    }

    if (normalizedDex === null) {
      return false;
    }

    return policy.includeDexes.includes(normalizedDex);
  }

  private isDexExcluded(policy: IAlertSemanticFilterPolicy, normalizedDex: string | null): boolean {
    if (normalizedDex === null) {
      return false;
    }

    return policy.excludeDexes.includes(normalizedDex);
  }

  private isSemanticTypeAllowed(
    filterType: AlertSmartFilterType,
    eventContext: IAlertSemanticEventContext,
  ): boolean {
    if (filterType === AlertSmartFilterType.ALL) {
      return true;
    }

    if (filterType === AlertSmartFilterType.TRANSFER) {
      return eventContext.eventType === ClassifiedEventType.TRANSFER;
    }

    const isSwapEvent: boolean = eventContext.eventType === ClassifiedEventType.SWAP;

    if (!isSwapEvent) {
      return false;
    }

    if (filterType === AlertSmartFilterType.BUY) {
      return eventContext.direction === EventDirection.IN;
    }

    return eventContext.direction === EventDirection.OUT;
  }

  private buildSemanticDecision(
    allowed: boolean,
    suppressedReason: ISemanticFilterDecision['suppressedReason'],
    normalizedDex: string | null,
  ): ISemanticFilterDecision {
    return {
      allowed,
      suppressedReason,
      normalizedDex,
    };
  }
}
