import { describe, expect, it } from 'vitest';

import { MetricsService } from './metrics.service';

describe('MetricsService', (): void => {
  it('returns prometheus-formatted metrics string', async (): Promise<void> => {
    const service: MetricsService = new MetricsService();

    service.chainLagBlocks.set({ chain: 'ethereum_mainnet' }, 5);
    service.rpcRequestsTotal.inc({
      chain: 'ethereum_mainnet',
      provider: 'alchemy',
      method: 'getBlock',
      status: 'ok',
    });

    const metrics: string = await service.getMetrics();

    expect(metrics).toContain('chain_lag_blocks');
    expect(metrics).toContain('rpc_requests_total');
    expect(metrics).toContain('ethereum_mainnet');
  });

  it('returns correct content type', (): void => {
    const service: MetricsService = new MetricsService();
    expect(service.getContentType()).toContain('text/plain');
  });

  it('tracks rate limit queue size gauge', async (): Promise<void> => {
    const service: MetricsService = new MetricsService();

    service.rateLimitQueueSize.set({ limiter: 'etherscan' }, 3);

    const metrics: string = await service.getMetrics();
    expect(metrics).toContain('rate_limit_queue_size');
    expect(metrics).toContain('etherscan');
  });

  it('tracks cache metrics gauges', async (): Promise<void> => {
    const service: MetricsService = new MetricsService();

    service.cacheKeys.set({ cache: 'history' }, 10);
    service.cacheHitsTotal.set({ cache: 'history' }, 42);
    service.cacheMissesTotal.set({ cache: 'history' }, 7);

    const metrics: string = await service.getMetrics();
    expect(metrics).toContain('cache_keys');
    expect(metrics).toContain('cache_hits_total');
    expect(metrics).toContain('cache_misses_total');
    expect(metrics).toContain('history');
  });
});
