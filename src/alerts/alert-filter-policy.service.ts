import { Injectable } from '@nestjs/common';

import type {
  AlertFilterPolicy,
  ThresholdDecision,
} from '../features/alerts/alert-filter.interfaces';

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
}
