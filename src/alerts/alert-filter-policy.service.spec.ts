import { describe, expect, it } from 'vitest';

import { AlertFilterPolicyService } from './alert-filter-policy.service';

describe('AlertFilterPolicyService', (): void => {
  it('blocks alert when usd amount is below threshold', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();
    const decision = service.evaluateUsdThreshold(
      {
        thresholdUsd: 1000,
        minAmountUsd: 0,
      },
      100,
      false,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.suppressedReason).toBe('threshold_usd');
  });

  it('allows alert in fail-open mode when usd is unavailable', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();
    const decision = service.evaluateUsdThreshold(
      {
        thresholdUsd: 1000,
        minAmountUsd: 500,
      },
      null,
      true,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.usdUnavailable).toBe(true);
  });
});
