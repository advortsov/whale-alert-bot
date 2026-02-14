import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Bottleneck from 'bottleneck';

import {
  type IBottleneckConfig,
  type ILimiterMetrics,
  LimiterKey,
  RequestPriority,
} from './bottleneck-rate-limiter.interfaces';
import { buildLimiterConfigs } from './rate-limiter-config.factory';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class BottleneckRateLimiterService implements OnModuleDestroy {
  private readonly logger: Logger = new Logger(BottleneckRateLimiterService.name);
  private readonly limiters: Map<LimiterKey, Bottleneck> = new Map<LimiterKey, Bottleneck>();

  public constructor(appConfigService: AppConfigService) {
    const configs: ReadonlyMap<LimiterKey, IBottleneckConfig> =
      buildLimiterConfigs(appConfigService);

    for (const [key, config] of configs) {
      const limiter: Bottleneck =
        config.reservoir !== undefined
          ? new Bottleneck({
              minTime: config.minTime,
              maxConcurrent: config.maxConcurrent,
              reservoir: config.reservoir,
              reservoirRefreshAmount: config.reservoir,
              reservoirRefreshInterval: 60_000,
            })
          : new Bottleneck({
              minTime: config.minTime,
              maxConcurrent: config.maxConcurrent,
            });

      limiter.on('error', (error: unknown): void => {
        const message: string = error instanceof Error ? error.message : String(error);
        this.logger.error(`Bottleneck error limiter=${key}: ${message}`);
      });

      limiter.on('dropped', (): void => {
        this.logger.warn(`Request dropped from queue limiter=${key}`);
      });

      this.limiters.set(key, limiter);
    }
  }

  public async schedule<T>(
    key: LimiterKey,
    operation: () => Promise<T>,
    priority: RequestPriority = RequestPriority.NORMAL,
  ): Promise<T> {
    const limiter: Bottleneck | undefined = this.limiters.get(key);

    if (limiter === undefined) {
      throw new Error(`No rate limiter configured for key=${key}`);
    }

    return limiter.schedule({ priority }, operation);
  }

  public getMetrics(key: LimiterKey): ILimiterMetrics {
    const limiter: Bottleneck | undefined = this.limiters.get(key);

    if (limiter === undefined) {
      return { queueSize: 0, running: 0 };
    }

    const counts: Bottleneck.Counts = limiter.counts();

    return {
      queueSize: counts.QUEUED + counts.RECEIVED,
      running: counts.RUNNING + counts.EXECUTING,
    };
  }

  public getAllKeys(): readonly LimiterKey[] {
    return [...this.limiters.keys()];
  }

  public async onModuleDestroy(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const [key, limiter] of this.limiters) {
      this.logger.log(`Stopping rate limiter key=${key}`);
      stopPromises.push(
        limiter
          .stop({ dropWaitingJobs: true })
          .then((): void => {
            this.logger.log(`Rate limiter stopped key=${key}`);
          })
          .catch((error: unknown): void => {
            const message: string = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to stop rate limiter key=${key}: ${message}`);
          }),
      );
    }

    await Promise.allSettled(stopPromises);
  }
}
