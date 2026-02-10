import { Injectable } from '@nestjs/common';

import { ClassifiedEventType, EventDirection } from '../chain/chain.types';
import type {
  AlertFilterPolicy,
  ThresholdDecision,
} from '../features/alerts/alert-filter.interfaces';
import type {
  AlertCexFlowContext,
  AlertCexFlowDecision,
  AlertCexFlowPolicy,
} from '../features/alerts/cex-flow.interfaces';
import { AlertCexFlowMode } from '../features/alerts/cex-flow.interfaces';
import { normalizeDexKey } from '../features/alerts/dex-normalizer.util';
import type {
  AlertSemanticEventContext,
  AlertSemanticFilterPolicy,
  SemanticFilterDecision,
} from '../features/alerts/smart-filter.interfaces';
import { AlertSmartFilterType } from '../features/alerts/smart-filter.interfaces';

@Injectable()
export class AlertFilterPolicyService {
  public evaluateUsdThreshold(
    policy: AlertFilterPolicy,
    usdAmount: number | null,
    usdUnavailable: boolean,
  ): ThresholdDecision {
    const thresholdUsd: number = policy.thresholdUsd > 0 ? policy.thresholdUsd : 0;
    const minAmountUsd: number = policy.minAmountUsd > 0 ? policy.minAmountUsd : 0;

    if (thresholdUsd <= 0 && minAmountUsd <= 0) {
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

    if (thresholdUsd > 0 && usdAmount < thresholdUsd) {
      return {
        allowed: false,
        suppressedReason: 'threshold_usd',
        usdAmount,
        usdUnavailable: false,
      };
    }

    if (minAmountUsd > 0 && usdAmount < minAmountUsd) {
      return {
        allowed: false,
        suppressedReason: 'min_amount_usd',
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
    policy: AlertSemanticFilterPolicy,
    eventContext: AlertSemanticEventContext,
  ): SemanticFilterDecision {
    const normalizedDex: string | null = normalizeDexKey(eventContext.dex);
    const normalizedType: AlertSmartFilterType = policy.type;

    if (
      normalizedType === AlertSmartFilterType.TRANSFER &&
      eventContext.eventType !== ClassifiedEventType.TRANSFER
    ) {
      return {
        allowed: false,
        suppressedReason: 'type_filter',
        normalizedDex,
      };
    }

    if (
      normalizedType === AlertSmartFilterType.BUY &&
      (eventContext.eventType !== ClassifiedEventType.SWAP ||
        eventContext.direction !== EventDirection.IN)
    ) {
      return {
        allowed: false,
        suppressedReason: 'type_filter',
        normalizedDex,
      };
    }

    if (
      normalizedType === AlertSmartFilterType.SELL &&
      (eventContext.eventType !== ClassifiedEventType.SWAP ||
        eventContext.direction !== EventDirection.OUT)
    ) {
      return {
        allowed: false,
        suppressedReason: 'type_filter',
        normalizedDex,
      };
    }

    if (eventContext.eventType === ClassifiedEventType.SWAP) {
      if (policy.includeDexes.length > 0) {
        const inIncludeList: boolean =
          normalizedDex !== null && policy.includeDexes.includes(normalizedDex);

        if (!inIncludeList) {
          return {
            allowed: false,
            suppressedReason: 'dex_include',
            normalizedDex,
          };
        }
      }

      if (normalizedDex !== null && policy.excludeDexes.includes(normalizedDex)) {
        return {
          allowed: false,
          suppressedReason: 'dex_exclude',
          normalizedDex,
        };
      }
    }

    return {
      allowed: true,
      suppressedReason: null,
      normalizedDex,
    };
  }

  public evaluateCexFlow(
    policy: AlertCexFlowPolicy,
    context: AlertCexFlowContext,
  ): AlertCexFlowDecision {
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
}
