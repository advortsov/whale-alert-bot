export interface ISimpleCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  del(key: string): void;
  has(key: string): boolean;
  keys(): string[];
  stats(): ICacheStats;
}

export interface ICacheStats {
  readonly keys: number;
  readonly hits: number;
  readonly misses: number;
}

export type SimpleCacheOptions = {
  readonly ttlSec: number;
  readonly maxKeys?: number;
  readonly checkperiod?: number;
};

export type TieredCacheOptions = {
  readonly freshTtlSec: number;
  readonly staleTtlSec: number;
  readonly maxKeys?: number;
};

export type TieredCacheResult<T> = {
  readonly value: T;
  readonly fresh: boolean;
};
