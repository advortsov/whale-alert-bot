import { describe, expect, it } from 'vitest';

import { HistoryCacheService } from './history-cache.service';
import type { AppConfigService } from '../config/app-config.service';

type AppConfigServiceStub = {
  readonly historyCacheTtlSec: number;
  readonly historyStaleOnErrorSec: number;
};

describe('HistoryCacheService', (): void => {
  it('returns fresh cache entry before ttl expiry', (): void => {
    const appConfigServiceStub: AppConfigServiceStub = {
      historyCacheTtlSec: 120,
      historyStaleOnErrorSec: 600,
    };
    const service: HistoryCacheService = new HistoryCacheService(
      appConfigServiceStub as unknown as AppConfigService,
    );

    service.set('0xabc', 5, 'cached message', 1000);
    const freshEntry = service.getFresh('0xabc', 5, 1000 + 119_000);

    expect(freshEntry?.message).toBe('cached message');
  });

  it('returns null for fresh entry after ttl expiry but still provides stale entry', (): void => {
    const appConfigServiceStub: AppConfigServiceStub = {
      historyCacheTtlSec: 120,
      historyStaleOnErrorSec: 600,
    };
    const service: HistoryCacheService = new HistoryCacheService(
      appConfigServiceStub as unknown as AppConfigService,
    );

    service.set('0xabc', 5, 'cached message', 2000);

    const freshEntry = service.getFresh('0xabc', 5, 2000 + 121_000);
    const staleEntry = service.getStale('0xabc', 5, 2000 + 121_000);

    expect(freshEntry).toBeNull();
    expect(staleEntry?.message).toBe('cached message');
  });

  it('removes stale cache entry after stale ttl expiry', (): void => {
    const appConfigServiceStub: AppConfigServiceStub = {
      historyCacheTtlSec: 120,
      historyStaleOnErrorSec: 600,
    };
    const service: HistoryCacheService = new HistoryCacheService(
      appConfigServiceStub as unknown as AppConfigService,
    );

    service.set('0xabc', 5, 'cached message', 3000);

    const staleEntry = service.getStale('0xabc', 5, 3000 + 601_000);
    const staleEntryAfterDelete = service.getStale('0xabc', 5, 3000 + 602_000);

    expect(staleEntry).toBeNull();
    expect(staleEntryAfterDelete).toBeNull();
  });
});
