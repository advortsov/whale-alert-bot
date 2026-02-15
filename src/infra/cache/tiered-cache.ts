import type { SimpleCacheOptions, TieredCacheOptions } from './cache.interfaces';
import { SimpleCacheImpl } from './simple-cache';

interface ITieredCacheEntry<T> {
  readonly value: T;
  readonly freshUntilEpochMs: number;
}

export class TieredCache<T> {
  private readonly cache: SimpleCacheImpl<ITieredCacheEntry<T>>;
  private readonly freshTtlMs: number;

  public constructor(options: TieredCacheOptions) {
    this.freshTtlMs = options.freshTtlSec * 1000;
    const cacheOptions: SimpleCacheOptions = {
      ttlSec: options.staleTtlSec,
      checkperiod: 0,
      ...(options.maxKeys !== undefined ? { maxKeys: options.maxKeys } : {}),
    };
    this.cache = new SimpleCacheImpl<ITieredCacheEntry<T>>(cacheOptions);
  }

  public getFresh(key: string, nowEpochMs: number = Date.now()): T | undefined {
    const entry: ITieredCacheEntry<T> | undefined = this.cache.get(key);

    if (entry === undefined) {
      return undefined;
    }

    if (nowEpochMs > entry.freshUntilEpochMs) {
      return undefined;
    }

    return entry.value;
  }

  public getStale(key: string): T | undefined {
    const entry: ITieredCacheEntry<T> | undefined = this.cache.get(key);

    if (entry === undefined) {
      return undefined;
    }

    return entry.value;
  }

  public set(key: string, value: T, nowEpochMs: number = Date.now()): void {
    const entry: ITieredCacheEntry<T> = {
      value,
      freshUntilEpochMs: nowEpochMs + this.freshTtlMs,
    };
    this.cache.set(key, entry);
  }

  public del(key: string): void {
    this.cache.del(key);
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public keys(): string[] {
    return this.cache.keys();
  }
}
