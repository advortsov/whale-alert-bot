import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AlertSuppressionService } from './alert-suppression.service';
import { applyTestEnv } from '../../../../test/helpers/test-env';
import {
  AssetStandard,
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../../common/interfaces/chain.types';
import { AppConfigService } from '../../../config/app-config.service';
import { AlertSuppressionReason } from '../entities/alert.interfaces';

const buildTransferEvent = (tokenAmountRaw: string): ClassifiedEvent => {
  return {
    chainId: ChainId.ETHEREUM_MAINNET,
    txHash: '0xtx',
    logIndex: 1,
    trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    eventType: ClassifiedEventType.TRANSFER,
    direction: EventDirection.OUT,
    assetStandard: AssetStandard.ERC20,
    contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenSymbol: 'USDT',
    tokenDecimals: 6,
    tokenAmountRaw,
    valueFormatted: null,
    counterpartyAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    dex: null,
    pair: null,
    usdPrice: null,
    usdAmount: null,
    usdUnavailable: true,
    swapFromSymbol: null,
    swapFromAmountText: null,
    swapToSymbol: null,
    swapToAmountText: null,
  };
};

describe('AlertSuppressionService', (): void => {
  beforeAll((): void => {
    applyTestEnv();
  });

  beforeEach((): void => {
    vi.useFakeTimers();
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('suppresses zero-value transfer alerts', (): void => {
    const service: AlertSuppressionService = new AlertSuppressionService(new AppConfigService());

    const decision = service.shouldSuppress(buildTransferEvent('0'));

    expect(decision.suppressed).toBe(true);
    expect(decision.reason).toBe(AlertSuppressionReason.ZERO_AMOUNT);
  });

  it('suppresses repeated events within min interval and allows after interval', (): void => {
    const service: AlertSuppressionService = new AlertSuppressionService(new AppConfigService());

    const firstDecision = service.shouldSuppress(buildTransferEvent('10'));
    expect(firstDecision.suppressed).toBe(false);

    vi.advanceTimersByTime(1_000);
    const secondDecision = service.shouldSuppress(buildTransferEvent('10'));
    expect(secondDecision.suppressed).toBe(true);
    expect(secondDecision.reason).toBe(AlertSuppressionReason.MIN_INTERVAL);

    vi.advanceTimersByTime(11_000);
    const thirdDecision = service.shouldSuppress(buildTransferEvent('10'));
    expect(thirdDecision.suppressed).toBe(false);
  });
});
