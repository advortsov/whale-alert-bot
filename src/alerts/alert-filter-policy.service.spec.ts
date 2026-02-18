import { describe, expect, it } from 'vitest';

import { AlertFilterPolicyService } from './alert-filter-policy.service';
import { ClassifiedEventType, EventDirection } from '../common/interfaces/chain.types';
import { AlertCexFlowMode } from '../features/alerts/cex-flow.interfaces';
import { AlertSmartFilterType } from '../features/alerts/smart-filter.interfaces';

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

  it('uses highest value between threshold and legacy min_amount_usd', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();
    const decision = service.evaluateUsdThreshold(
      {
        thresholdUsd: 1000,
        minAmountUsd: 5000,
      },
      3000,
      false,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.suppressedReason).toBe('threshold_usd');
  });

  it('blocks swap when type filter is transfer', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();

    const decision = service.evaluateSemanticFilters(
      {
        type: AlertSmartFilterType.TRANSFER,
        includeDexes: [],
        excludeDexes: [],
      },
      {
        eventType: ClassifiedEventType.SWAP,
        direction: EventDirection.IN,
        dex: 'Uniswap V3',
      },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.suppressedReason).toBe('type_filter');
  });

  it('allows buy filter for incoming swap', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();

    const decision = service.evaluateSemanticFilters(
      {
        type: AlertSmartFilterType.BUY,
        includeDexes: [],
        excludeDexes: [],
      },
      {
        eventType: ClassifiedEventType.SWAP,
        direction: EventDirection.IN,
        dex: 'Uniswap V2',
      },
    );

    expect(decision.allowed).toBe(true);
    expect(decision.suppressedReason).toBeNull();
  });

  it('blocks swap when dex is not in include list', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();

    const decision = service.evaluateSemanticFilters(
      {
        type: AlertSmartFilterType.ALL,
        includeDexes: ['curve'],
        excludeDexes: [],
      },
      {
        eventType: ClassifiedEventType.SWAP,
        direction: EventDirection.IN,
        dex: 'Uniswap V2',
      },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.suppressedReason).toBe('dex_include');
  });

  it('blocks swap when dex is in exclude list', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();

    const decision = service.evaluateSemanticFilters(
      {
        type: AlertSmartFilterType.ALL,
        includeDexes: [],
        excludeDexes: ['uniswap'],
      },
      {
        eventType: ClassifiedEventType.SWAP,
        direction: EventDirection.OUT,
        dex: 'Uniswap V3',
      },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.suppressedReason).toBe('dex_exclude');
  });

  it('blocks non-transfer event when cex flow filter is enabled', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();

    const decision = service.evaluateCexFlow(
      {
        mode: AlertCexFlowMode.OUT,
      },
      {
        eventType: ClassifiedEventType.SWAP,
        direction: EventDirection.OUT,
        counterpartyTag: 'binance',
      },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.suppressedReason).toBe('cex_transfer_only');
  });

  it('allows transfer when cex flow is out and counterparty is known cex', (): void => {
    const service: AlertFilterPolicyService = new AlertFilterPolicyService();

    const decision = service.evaluateCexFlow(
      {
        mode: AlertCexFlowMode.OUT,
      },
      {
        eventType: ClassifiedEventType.TRANSFER,
        direction: EventDirection.OUT,
        counterpartyTag: 'binance',
      },
    );

    expect(decision.allowed).toBe(true);
    expect(decision.suppressedReason).toBeNull();
  });
});
