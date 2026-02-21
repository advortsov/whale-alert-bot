import type { ICacheStats, ISimpleCache } from './cache.interfaces';

const registry = new Map<string, ISimpleCache<unknown>>();

export function registerCache(name: string, cache: ISimpleCache<unknown>): void {
  registry.set(name, cache);
}

export function getAllCacheStats(): ReadonlyMap<string, ICacheStats> {
  const result = new Map<string, ICacheStats>();
  for (const [name, cache] of registry) {
    result.set(name, cache.stats());
  }
  return result;
}
