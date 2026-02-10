import { beforeAll, describe, expect, it } from 'vitest';

import { AlertSuppressionService } from './alert-suppression.service';
import { AlertSuppressionReason } from './alert.interfaces';
import { applyTestEnv } from '../../test/helpers/test-env';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../chain/chain.types';
import { AppConfigService } from '../config/app-config.service';

const buildTransferEvent = (tokenAmountRaw: string): ClassifiedEvent => {
  return {
    chainId: ChainId.ETHEREUM_MAINNET,
    txHash: '0xtx',
    logIndex: 1,
    trackedAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    eventType: ClassifiedEventType.TRANSFER,
    direction: EventDirection.OUT,
    contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenSymbol: 'USDT',
    tokenDecimals: 6,
    tokenAmountRaw,
    valueFormatted: null,
    counterpartyAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    dex: null,
    pair: null,
  };
};

describe('AlertSuppressionService', (): void => {
  beforeAll((): void => {
    applyTestEnv();
  });

  it('suppresses zero-value transfer alerts', (): void => {
    const service: AlertSuppressionService = new AlertSuppressionService(new AppConfigService());

    const decision = service.shouldSuppress(buildTransferEvent('0'), 1000);

    expect(decision.suppressed).toBe(true);
    expect(decision.reason).toBe(AlertSuppressionReason.ZERO_AMOUNT);
  });

  it('suppresses repeated events within min interval and allows after interval', (): void => {
    const service: AlertSuppressionService = new AlertSuppressionService(new AppConfigService());

    const firstDecision = service.shouldSuppress(buildTransferEvent('10'), 1000);
    const secondDecision = service.shouldSuppress(buildTransferEvent('10'), 1001);
    const thirdDecision = service.shouldSuppress(buildTransferEvent('10'), 12000);

    expect(firstDecision.suppressed).toBe(false);
    expect(secondDecision.suppressed).toBe(true);
    expect(secondDecision.reason).toBe(AlertSuppressionReason.MIN_INTERVAL);
    expect(thirdDecision.suppressed).toBe(false);
  });
});
