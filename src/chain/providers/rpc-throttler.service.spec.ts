import { describe, expect, it } from 'vitest';

import { RpcThrottlerService } from './rpc-throttler.service';
import type { AppConfigService } from '../../config/app-config.service';

const createConfigStub = (
  minIntervalMs: number,
  backoffBaseMs: number,
  backoffMaxMs: number,
  solanaBackoffBaseMs: number = backoffBaseMs,
): AppConfigService =>
  ({
    chainRpcMinIntervalMs: minIntervalMs,
    chainBackoffBaseMs: backoffBaseMs,
    chainSolanaBackoffBaseMs: solanaBackoffBaseMs,
    chainBackoffMaxMs: backoffMaxMs,
  }) as unknown as AppConfigService;

describe('RpcThrottlerService', (): void => {
  it('respects configured minimum interval between scheduled calls', async (): Promise<void> => {
    const throttler: RpcThrottlerService = new RpcThrottlerService(createConfigStub(30, 10, 40));
    const startedAt: number[] = [];

    await throttler.schedule(async (): Promise<void> => {
      startedAt.push(Date.now());
    });

    await throttler.schedule(async (): Promise<void> => {
      startedAt.push(Date.now());
    });

    expect(startedAt).toHaveLength(2);
    const firstStartAt: number | undefined = startedAt[0];
    const secondStartAt: number | undefined = startedAt[1];

    if (firstStartAt === undefined || secondStartAt === undefined) {
      throw new Error('Expected two scheduled timestamps.');
    }

    expect(secondStartAt - firstStartAt).toBeGreaterThanOrEqual(20);
  });

  it('increases and resets backoff within configured bounds', (): void => {
    const throttler: RpcThrottlerService = new RpcThrottlerService(createConfigStub(0, 100, 300));

    expect(throttler.getCurrentBackoffMs()).toBe(0);

    throttler.increaseBackoff('rate-limit');
    expect(throttler.getCurrentBackoffMs()).toBe(100);

    throttler.increaseBackoff('rate-limit');
    expect(throttler.getCurrentBackoffMs()).toBe(200);

    throttler.increaseBackoff('rate-limit');
    expect(throttler.getCurrentBackoffMs()).toBe(300);

    throttler.resetBackoff();
    expect(throttler.getCurrentBackoffMs()).toBe(0);
  });

  it('keeps backoff state isolated per chain key', (): void => {
    const throttler: RpcThrottlerService = new RpcThrottlerService(createConfigStub(0, 100, 300));

    throttler.increaseBackoffForKey('solana_mainnet', 'rate-limit');
    throttler.increaseBackoffForKey('solana_mainnet', 'rate-limit');
    throttler.increaseBackoffForKey('tron_mainnet', 'rate-limit');

    expect(throttler.getCurrentBackoffMsForKey('solana_mainnet')).toBe(200);
    expect(throttler.getCurrentBackoffMsForKey('tron_mainnet')).toBe(100);
    expect(throttler.getCurrentBackoffMsForKey('ethereum_mainnet')).toBe(0);
  });

  it('uses dedicated solana base backoff for solana throttle keys', (): void => {
    const throttler: RpcThrottlerService = new RpcThrottlerService(
      createConfigStub(0, 100, 60000, 5000),
    );

    throttler.increaseBackoffForKey('primary:solana_mainnet', 'rate-limit');
    throttler.increaseBackoffForKey('primary:ethereum_mainnet', 'rate-limit');

    expect(throttler.getCurrentBackoffMsForKey('primary:solana_mainnet')).toBe(5000);
    expect(throttler.getCurrentBackoffMsForKey('primary:ethereum_mainnet')).toBe(100);
  });
});
