import { describe, expect, it } from 'vitest';

import { LimiterKey, RequestPriority } from './bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from './bottleneck-rate-limiter.service';
import type { AppConfigService } from '../config/app-config.service';

const createConfigStub = (): AppConfigService =>
  ({
    rateLimitEthRpcMinTimeMs: 0,
    rateLimitEthRpcMaxConcurrent: 5,
    rateLimitEtherscanMinTimeMs: 0,
    rateLimitEtherscanMaxConcurrent: 1,
    rateLimitSolanaHeliusMinTimeMs: 0,
    rateLimitSolanaHeliusMaxConcurrent: 5,
    rateLimitTronGridMinTimeMs: 0,
    rateLimitTronGridMaxConcurrent: 1,
    rateLimitCoingeckoMinTimeMs: 0,
    rateLimitCoingeckoMaxConcurrent: 1,
  }) as unknown as AppConfigService;

describe('BottleneckRateLimiterService', (): void => {
  it('schedules and executes an operation successfully', async (): Promise<void> => {
    const service: BottleneckRateLimiterService = new BottleneckRateLimiterService(
      createConfigStub(),
    );

    const result: string = await service.schedule(
      LimiterKey.ETHERSCAN,
      async (): Promise<string> => 'ok',
    );

    expect(result).toBe('ok');
    await service.onModuleDestroy();
  });

  it('propagates operation errors', async (): Promise<void> => {
    const service: BottleneckRateLimiterService = new BottleneckRateLimiterService(
      createConfigStub(),
    );

    await expect(
      service.schedule(LimiterKey.ETHERSCAN, async (): Promise<string> => {
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');

    await service.onModuleDestroy();
  });

  it('returns queue metrics', async (): Promise<void> => {
    const service: BottleneckRateLimiterService = new BottleneckRateLimiterService(
      createConfigStub(),
    );

    const metrics = service.getMetrics(LimiterKey.ETHEREUM_PRIMARY);
    expect(metrics.queueSize).toBe(0);
    expect(metrics.running).toBe(0);

    await service.onModuleDestroy();
  });

  it('returns all limiter keys', (): void => {
    const service: BottleneckRateLimiterService = new BottleneckRateLimiterService(
      createConfigStub(),
    );

    const keys = service.getAllKeys();
    expect(keys).toContain(LimiterKey.ETHEREUM_PRIMARY);
    expect(keys).toContain(LimiterKey.ETHERSCAN);
    expect(keys).toContain(LimiterKey.COINGECKO);
  });

  it('respects priority ordering', async (): Promise<void> => {
    const service: BottleneckRateLimiterService = new BottleneckRateLimiterService(
      createConfigStub(),
    );

    const results: string[] = [];

    await Promise.all([
      service.schedule(
        LimiterKey.ETHERSCAN,
        async (): Promise<void> => {
          results.push('normal');
        },
        RequestPriority.NORMAL,
      ),
      service.schedule(
        LimiterKey.ETHERSCAN,
        async (): Promise<void> => {
          results.push('critical');
        },
        RequestPriority.CRITICAL,
      ),
    ]);

    expect(results).toHaveLength(2);
    await service.onModuleDestroy();
  });

  it('throws for unknown limiter key', async (): Promise<void> => {
    const service: BottleneckRateLimiterService = new BottleneckRateLimiterService(
      createConfigStub(),
    );

    await expect(
      service.schedule('unknown_key' as LimiterKey, async (): Promise<string> => 'ok'),
    ).rejects.toThrow('No rate limiter configured for key=unknown_key');

    await service.onModuleDestroy();
  });
});
