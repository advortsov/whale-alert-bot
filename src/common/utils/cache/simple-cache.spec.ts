import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimpleCacheImpl } from './simple-cache';

describe('SimpleCacheImpl', (): void => {
  beforeEach((): void => {
    vi.useFakeTimers();
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('returns undefined for missing key', (): void => {
    const cache = new SimpleCacheImpl<string>({ ttlSec: 60 });

    expect(cache.get('missing')).toBeUndefined();
  });

  it('stores and retrieves a value', (): void => {
    const cache = new SimpleCacheImpl<string>({ ttlSec: 60 });

    cache.set('key', 'value');

    expect(cache.get('key')).toBe('value');
    expect(cache.has('key')).toBe(true);
    expect(cache.keys()).toEqual(['key']);
  });

  it('deletes a value', (): void => {
    const cache = new SimpleCacheImpl<string>({ ttlSec: 60 });
    cache.set('key', 'value');

    cache.del('key');

    expect(cache.get('key')).toBeUndefined();
    expect(cache.has('key')).toBe(false);
  });

  it('expires entries after TTL', (): void => {
    const cache = new SimpleCacheImpl<string>({ ttlSec: 10, checkperiod: 0 });

    cache.set('key', 'value');

    vi.advanceTimersByTime(9_999);
    expect(cache.get('key')).toBe('value');

    vi.advanceTimersByTime(2);
    expect(cache.get('key')).toBeUndefined();
  });

  it('evicts oldest key when maxKeys is reached', (): void => {
    const cache = new SimpleCacheImpl<string>({ ttlSec: 60, maxKeys: 2 });

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  it('does not evict when updating existing key within maxKeys', (): void => {
    const cache = new SimpleCacheImpl<string>({ ttlSec: 60, maxKeys: 2 });

    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('a', 'updated');

    expect(cache.get('a')).toBe('updated');
    expect(cache.get('b')).toBe('2');
  });

  it('reports stats', (): void => {
    const cache = new SimpleCacheImpl<string>({ ttlSec: 60 });

    cache.set('key', 'value');
    cache.get('key');
    cache.get('missing');

    const stats = cache.stats();
    expect(stats.keys).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });
});
