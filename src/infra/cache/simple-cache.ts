// eslint-disable-next-line @typescript-eslint/no-require-imports
import NodeCache = require('node-cache');

import type { ICacheStats, ISimpleCache, SimpleCacheOptions } from './cache.interfaces';

export class SimpleCacheImpl<T> implements ISimpleCache<T> {
  private readonly cache: NodeCache;
  private readonly maxKeys: number | undefined;

  public constructor(options: SimpleCacheOptions) {
    this.maxKeys = options.maxKeys;
    this.cache = new NodeCache({
      stdTTL: options.ttlSec,
      checkperiod: options.checkperiod ?? 0,
      useClones: false,
    });
  }

  public get(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  public set(key: string, value: T): void {
    if (this.maxKeys !== undefined) {
      this.evictIfNeeded(key);
    }
    this.cache.set(key, value);
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

  public stats(): ICacheStats {
    const nodeStats = this.cache.getStats();
    return {
      keys: nodeStats.keys,
      hits: nodeStats.hits,
      misses: nodeStats.misses,
    };
  }

  private evictIfNeeded(incomingKey: string): void {
    if (this.maxKeys === undefined) {
      return;
    }

    if (this.cache.has(incomingKey)) {
      return;
    }

    const allKeys: string[] = this.cache.keys();

    while (allKeys.length >= this.maxKeys) {
      const oldestKey: string | undefined = allKeys.shift();

      if (oldestKey === undefined) {
        break;
      }

      this.cache.del(oldestKey);
    }
  }
}
