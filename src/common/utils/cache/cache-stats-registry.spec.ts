import { afterEach, describe, expect, it } from 'vitest';

import { type ICacheStats, getAllCacheStats, registerCache, SimpleCacheImpl } from './index';

describe('CacheStatsRegistry', (): void => {
  afterEach((): void => {
    // Registry is module-level state; re-registering with same name overwrites
  });

  it('returns stats for registered caches', (): void => {
    const cache: SimpleCacheImpl<string> = new SimpleCacheImpl<string>({ ttlSec: 60 });
    registerCache('test_cache', cache as SimpleCacheImpl<unknown>);

    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.get('key1');
    cache.get('missing');

    const allStats: ReadonlyMap<string, ICacheStats> = getAllCacheStats();
    const stats: ICacheStats | undefined = allStats.get('test_cache');

    expect(stats).toBeDefined();
    expect(stats?.keys).toBe(2);
    expect(stats?.hits).toBe(1);
    expect(stats?.misses).toBe(1);
  });

  it('tracks multiple caches independently', (): void => {
    const cacheA: SimpleCacheImpl<number> = new SimpleCacheImpl<number>({ ttlSec: 60 });
    const cacheB: SimpleCacheImpl<number> = new SimpleCacheImpl<number>({ ttlSec: 60 });
    registerCache('cache_a', cacheA as SimpleCacheImpl<unknown>);
    registerCache('cache_b', cacheB as SimpleCacheImpl<unknown>);

    cacheA.set('x', 1);
    cacheB.set('y', 2);
    cacheB.set('z', 3);

    const allStats: ReadonlyMap<string, ICacheStats> = getAllCacheStats();

    expect(allStats.get('cache_a')?.keys).toBe(1);
    expect(allStats.get('cache_b')?.keys).toBe(2);
  });
});
