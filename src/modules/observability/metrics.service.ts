import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

import { ChainKey } from '../../common/interfaces/chain-key.interfaces';

// Histogram bucket boundaries in seconds for RPC latency distribution
/* eslint-disable no-magic-numbers */
const RPC_DURATION_BUCKETS: number[] = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
/* eslint-enable no-magic-numbers */
const HOT_CACHE_STATUS_VALUES: readonly string[] = ['success', 'partial', 'failed'];
const HISTORY_ADAPTER_VALUES: readonly string[] = [
  'solana_rpc_history',
  'tron_grid_history',
  'etherscan_history',
];

@Injectable()
export class MetricsService {
  private readonly registry: Registry;

  public readonly rpcRequestsTotal: Counter;
  public readonly rpcRequestDurationSeconds: Histogram;
  public readonly rateLimitQueueSize: Gauge;
  public readonly rateLimitRejectedTotal: Counter;
  public readonly chainLagBlocks: Gauge;
  public readonly chainQueueSize: Gauge;
  public readonly chainBackoffMs: Gauge;
  public readonly pgPoolTotal: Gauge;
  public readonly pgPoolIdle: Gauge;
  public readonly pgPoolWaiting: Gauge;
  public readonly cacheKeys: Gauge;
  public readonly cacheHitsTotal: Gauge;
  public readonly cacheMissesTotal: Gauge;
  public readonly historyHotCacheRefreshTotal: Counter;
  public readonly historyHotCacheNewItemsTotal: Counter;
  public readonly historyHotCacheDuplicateItemsTotal: Counter;
  public readonly historyHotCacheWalletsGauge: Gauge;
  public readonly historyHotCacheEntryItemsGauge: Gauge;
  public readonly historyHotCacheRefreshDurationSeconds: Histogram;
  public readonly historyHttp429Total: Counter;

  public constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    const rpc = this.createRpcMetrics();
    this.rpcRequestsTotal = rpc.requestsTotal;
    this.rpcRequestDurationSeconds = rpc.durationSeconds;

    const rateLimit = this.createRateLimitMetrics();
    this.rateLimitQueueSize = rateLimit.queueSize;
    this.rateLimitRejectedTotal = rateLimit.rejectedTotal;

    const chain = this.createChainMetrics();
    this.chainLagBlocks = chain.lagBlocks;
    this.chainQueueSize = chain.queueSize;
    this.chainBackoffMs = chain.backoffMs;

    const pg = this.createPgPoolMetrics();
    this.pgPoolTotal = pg.total;
    this.pgPoolIdle = pg.idle;
    this.pgPoolWaiting = pg.waiting;

    const cache = this.createCacheMetrics();
    this.cacheKeys = cache.keys;
    this.cacheHitsTotal = cache.hitsTotal;
    this.cacheMissesTotal = cache.missesTotal;

    const historyHotCache = this.createHistoryHotCacheMetrics();
    this.historyHotCacheRefreshTotal = historyHotCache.refreshTotal;
    this.historyHotCacheNewItemsTotal = historyHotCache.newItemsTotal;
    this.historyHotCacheDuplicateItemsTotal = historyHotCache.duplicateItemsTotal;
    this.historyHotCacheWalletsGauge = historyHotCache.walletsGauge;
    this.historyHotCacheEntryItemsGauge = historyHotCache.entryItemsGauge;
    this.historyHotCacheRefreshDurationSeconds = historyHotCache.refreshDurationSeconds;
    this.historyHttp429Total = historyHotCache.historyHttp429Total;

    this.initializeHistoryMetricSeries();
  }

  public async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  public getContentType(): string {
    return this.registry.contentType;
  }

  private createRpcMetrics(): { requestsTotal: Counter; durationSeconds: Histogram } {
    return {
      requestsTotal: new Counter({
        name: 'rpc_requests_total',
        help: 'Total number of RPC requests',
        labelNames: ['chain', 'provider', 'method', 'status'] as const,
        registers: [this.registry],
      }),
      durationSeconds: new Histogram({
        name: 'rpc_request_duration_seconds',
        help: 'RPC request duration in seconds',
        labelNames: ['chain', 'provider', 'method'] as const,
        buckets: RPC_DURATION_BUCKETS,
        registers: [this.registry],
      }),
    };
  }

  private createRateLimitMetrics(): { queueSize: Gauge; rejectedTotal: Counter } {
    return {
      queueSize: new Gauge({
        name: 'rate_limit_queue_size',
        help: 'Current queue size for rate limiter',
        labelNames: ['limiter'] as const,
        registers: [this.registry],
      }),
      rejectedTotal: new Counter({
        name: 'rate_limit_rejected_total',
        help: 'Total rejected requests by rate limiter',
        labelNames: ['limiter'] as const,
        registers: [this.registry],
      }),
    };
  }

  private createChainMetrics(): { lagBlocks: Gauge; queueSize: Gauge; backoffMs: Gauge } {
    return {
      lagBlocks: new Gauge({
        name: 'chain_lag_blocks',
        help: 'Current block lag for chain watcher',
        labelNames: ['chain'] as const,
        registers: [this.registry],
      }),
      queueSize: new Gauge({
        name: 'chain_queue_size',
        help: 'Current block queue size for chain watcher',
        labelNames: ['chain'] as const,
        registers: [this.registry],
      }),
      backoffMs: new Gauge({
        name: 'chain_backoff_ms',
        help: 'Current backoff in milliseconds for chain watcher',
        labelNames: ['chain'] as const,
        registers: [this.registry],
      }),
    };
  }

  private createPgPoolMetrics(): { total: Gauge; idle: Gauge; waiting: Gauge } {
    return {
      total: new Gauge({
        name: 'pg_pool_connections_total',
        help: 'Total number of connections in the pg pool',
        registers: [this.registry],
      }),
      idle: new Gauge({
        name: 'pg_pool_connections_idle',
        help: 'Number of idle connections in the pg pool',
        registers: [this.registry],
      }),
      waiting: new Gauge({
        name: 'pg_pool_connections_waiting',
        help: 'Number of queued requests waiting for a pg connection',
        registers: [this.registry],
      }),
    };
  }

  private createCacheMetrics(): { keys: Gauge; hitsTotal: Gauge; missesTotal: Gauge } {
    return {
      keys: new Gauge({
        name: 'cache_keys',
        help: 'Current number of keys in cache',
        labelNames: ['cache'] as const,
        registers: [this.registry],
      }),
      hitsTotal: new Gauge({
        name: 'cache_hits_total',
        help: 'Total cache hits since start',
        labelNames: ['cache'] as const,
        registers: [this.registry],
      }),
      missesTotal: new Gauge({
        name: 'cache_misses_total',
        help: 'Total cache misses since start',
        labelNames: ['cache'] as const,
        registers: [this.registry],
      }),
    };
  }

  private createHistoryHotCacheMetrics(): {
    refreshTotal: Counter;
    newItemsTotal: Counter;
    duplicateItemsTotal: Counter;
    walletsGauge: Gauge;
    entryItemsGauge: Gauge;
    refreshDurationSeconds: Histogram;
    historyHttp429Total: Counter;
  } {
    return {
      refreshTotal: new Counter({
        name: 'history_hot_cache_refresh_total',
        help: 'Total number of history hot cache refresh cycles',
        labelNames: ['status', 'chain'] as const,
        registers: [this.registry],
      }),
      newItemsTotal: new Counter({
        name: 'history_hot_cache_new_items_total',
        help: 'Total number of new history items added to hot cache',
        labelNames: ['chain'] as const,
        registers: [this.registry],
      }),
      duplicateItemsTotal: new Counter({
        name: 'history_hot_cache_duplicate_items_total',
        help: 'Total number of duplicate history items skipped by hot cache',
        labelNames: ['chain'] as const,
        registers: [this.registry],
      }),
      walletsGauge: new Gauge({
        name: 'history_hot_cache_wallets_gauge',
        help: 'Current number of wallets in hot cache top set',
        registers: [this.registry],
      }),
      entryItemsGauge: new Gauge({
        name: 'history_hot_cache_entry_items_gauge',
        help: 'Average number of cached history items per wallet for chain',
        labelNames: ['chain'] as const,
        registers: [this.registry],
      }),
      refreshDurationSeconds: new Histogram({
        name: 'history_hot_cache_refresh_duration_seconds',
        help: 'Duration of history hot cache refresh cycle in seconds',
        labelNames: ['chain'] as const,
        buckets: RPC_DURATION_BUCKETS,
        registers: [this.registry],
      }),
      historyHttp429Total: new Counter({
        name: 'history_history_http_429_total',
        help: 'Total number of HTTP 429 responses for history adapters',
        labelNames: ['chain', 'adapter'] as const,
        registers: [this.registry],
      }),
    };
  }

  private initializeHistoryMetricSeries(): void {
    const chainKeys: readonly ChainKey[] = Object.values(ChainKey);

    for (const chainKey of chainKeys) {
      for (const status of HOT_CACHE_STATUS_VALUES) {
        this.historyHotCacheRefreshTotal.inc({ status, chain: chainKey }, 0);
      }

      this.historyHotCacheNewItemsTotal.inc({ chain: chainKey }, 0);
      this.historyHotCacheDuplicateItemsTotal.inc({ chain: chainKey }, 0);
      this.historyHotCacheEntryItemsGauge.set({ chain: chainKey }, 0);

      for (const adapter of HISTORY_ADAPTER_VALUES) {
        this.historyHttp429Total.inc({ chain: chainKey, adapter }, 0);
      }
    }

    this.historyHotCacheWalletsGauge.set(0);
  }
}
