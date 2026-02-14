import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { MetricsService } from './metrics.service';
import { AppConfigService } from '../config/app-config.service';
import type {
  ILimiterMetrics,
  LimiterKey,
} from '../rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../rate-limiting/bottleneck-rate-limiter.service';

const COLLECT_INTERVAL_MS = 10_000;

@Injectable()
export class MetricsCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger = new Logger(MetricsCollectorService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  public constructor(
    private readonly metricsService: MetricsService,
    private readonly rateLimiterService: BottleneckRateLimiterService,
    private readonly appConfigService: AppConfigService,
  ) {}

  public onModuleInit(): void {
    if (!this.appConfigService.metricsEnabled) {
      this.logger.log('Metrics collection disabled');
      return;
    }

    this.intervalHandle = setInterval((): void => {
      this.collectRateLimiterMetrics();
    }, COLLECT_INTERVAL_MS);

    this.logger.log(`Metrics collector started, interval=${String(COLLECT_INTERVAL_MS)}ms`);
  }

  public onModuleDestroy(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private collectRateLimiterMetrics(): void {
    const keys: readonly LimiterKey[] = this.rateLimiterService.getAllKeys();

    for (const key of keys) {
      const metrics: ILimiterMetrics = this.rateLimiterService.getMetrics(key);
      this.metricsService.rateLimitQueueSize.set({ limiter: key }, metrics.queueSize);
    }
  }
}
