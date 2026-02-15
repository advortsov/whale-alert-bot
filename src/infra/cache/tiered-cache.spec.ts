import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TieredCache } from './tiered-cache';

describe('TieredCache', (): void => {
  beforeEach((): void => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('returns fresh value within fresh TTL', (): void => {
    const cache = new TieredCache<string>({ freshTtlSec: 10, staleTtlSec: 60 });
    const now = Date.now();

    cache.set('key', 'value', now);

    expect(cache.getFresh('key', now + 5_000)).toBe('value');
  });

  it('returns undefined from getFresh after fresh TTL expires', (): void => {
    const cache = new TieredCache<string>({ freshTtlSec: 10, staleTtlSec: 60 });
    const now = Date.now();

    cache.set('key', 'value', now);

    expect(cache.getFresh('key', now + 11_000)).toBeUndefined();
  });

  it('returns stale value after fresh TTL but within stale TTL', (): void => {
    const cache = new TieredCache<string>({ freshTtlSec: 10, staleTtlSec: 60 });
    const now = Date.now();

    cache.set('key', 'value', now);

    expect(cache.getFresh('key', now + 15_000)).toBeUndefined();
    expect(cache.getStale('key')).toBe('value');
  });

  it('returns undefined from getStale after stale TTL expires', (): void => {
    const cache = new TieredCache<string>({ freshTtlSec: 10, staleTtlSec: 60 });
    const now = Date.now();

    cache.set('key', 'value', now);

    vi.advanceTimersByTime(61_000);
    expect(cache.getStale('key')).toBeUndefined();
  });

  it('returns undefined for missing key', (): void => {
    const cache = new TieredCache<string>({ freshTtlSec: 10, staleTtlSec: 60 });

    expect(cache.getFresh('missing')).toBeUndefined();
    expect(cache.getStale('missing')).toBeUndefined();
  });

  it('respects maxKeys with FIFO eviction', (): void => {
    const cache = new TieredCache<string>({ freshTtlSec: 10, staleTtlSec: 60, maxKeys: 2 });
    const now = Date.now();

    cache.set('a', '1', now);
    cache.set('b', '2', now);
    cache.set('c', '3', now);

    expect(cache.getFresh('a', now)).toBeUndefined();
    expect(cache.getFresh('b', now)).toBe('2');
    expect(cache.getFresh('c', now)).toBe('3');
  });

  it('deletes a key', (): void => {
    const cache = new TieredCache<string>({ freshTtlSec: 10, staleTtlSec: 60 });
    const now = Date.now();

    cache.set('key', 'value', now);
    cache.del('key');

    expect(cache.getFresh('key', now)).toBeUndefined();
    expect(cache.getStale('key')).toBeUndefined();
  });
});
