import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

// Histogram bucket boundaries in seconds for RPC latency distribution
/* eslint-disable no-magic-numbers */
const RPC_DURATION_BUCKETS: number[] = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
/* eslint-enable no-magic-numbers */

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

  public constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({ register: this.registry });

    this.rpcRequestsTotal = new Counter({
      name: 'rpc_requests_total',
      help: 'Total number of RPC requests',
      labelNames: ['chain', 'provider', 'method', 'status'] as const,
      registers: [this.registry],
    });

    this.rpcRequestDurationSeconds = new Histogram({
      name: 'rpc_request_duration_seconds',
      help: 'RPC request duration in seconds',
      labelNames: ['chain', 'provider', 'method'] as const,
      buckets: RPC_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.rateLimitQueueSize = new Gauge({
      name: 'rate_limit_queue_size',
      help: 'Current queue size for rate limiter',
      labelNames: ['limiter'] as const,
      registers: [this.registry],
    });

    this.rateLimitRejectedTotal = new Counter({
      name: 'rate_limit_rejected_total',
      help: 'Total rejected requests by rate limiter',
      labelNames: ['limiter'] as const,
      registers: [this.registry],
    });

    this.chainLagBlocks = new Gauge({
      name: 'chain_lag_blocks',
      help: 'Current block lag for chain watcher',
      labelNames: ['chain'] as const,
      registers: [this.registry],
    });

    this.chainQueueSize = new Gauge({
      name: 'chain_queue_size',
      help: 'Current block queue size for chain watcher',
      labelNames: ['chain'] as const,
      registers: [this.registry],
    });

    this.chainBackoffMs = new Gauge({
      name: 'chain_backoff_ms',
      help: 'Current backoff in milliseconds for chain watcher',
      labelNames: ['chain'] as const,
      registers: [this.registry],
    });

    this.pgPoolTotal = new Gauge({
      name: 'pg_pool_connections_total',
      help: 'Total number of connections in the pg pool',
      registers: [this.registry],
    });

    this.pgPoolIdle = new Gauge({
      name: 'pg_pool_connections_idle',
      help: 'Number of idle connections in the pg pool',
      registers: [this.registry],
    });

    this.pgPoolWaiting = new Gauge({
      name: 'pg_pool_connections_waiting',
      help: 'Number of queued requests waiting for a pg connection',
      registers: [this.registry],
    });
  }

  public async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  public getContentType(): string {
    return this.registry.contentType;
  }
}
