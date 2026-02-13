import { Injectable, Logger } from '@nestjs/common';

import type {
  ChainRuntimeEntry,
  RuntimeTelemetry,
  WatcherRuntimeSnapshot,
} from './runtime-status.interfaces';
import type { IChainRuntimeSnapshot } from '../chain/base-chain-stream.service';
import { AppConfigService } from '../config/app-config.service';
import type { ChainKey } from '../core/chains/chain-key.interfaces';

interface ISloThresholds {
  readonly maxLagWarn: number;
  readonly maxQueueWarn: number;
  readonly maxBackoffWarnMs: number;
}

const WARN_COOLDOWN_MS = 60_000;

@Injectable()
export class RuntimeStatusService {
  private readonly logger: Logger = new Logger(RuntimeStatusService.name);
  private snapshot: WatcherRuntimeSnapshot = {
    observedBlock: null,
    processedBlock: null,
    lag: null,
    queueSize: 0,
    backoffMs: 0,
    confirmations: 0,
    updatedAtIso: null,
  };

  private readonly chainEntries: Map<string, ChainRuntimeEntry> = new Map<
    string,
    ChainRuntimeEntry
  >();

  private readonly lastWarnTimestamps: Map<string, number> = new Map<string, number>();

  public constructor(private readonly appConfigService: AppConfigService) {}

  public setSnapshot(snapshot: WatcherRuntimeSnapshot): void {
    this.snapshot = snapshot;
  }

  public getSnapshot(): WatcherRuntimeSnapshot {
    return this.snapshot;
  }

  public setChainSnapshot(chainSnapshot: IChainRuntimeSnapshot): void {
    const entry: ChainRuntimeEntry = {
      chainKey: chainSnapshot.chainKey,
      observedBlock: chainSnapshot.observedBlock,
      processedBlock: chainSnapshot.processedBlock,
      lag: chainSnapshot.lag,
      queueSize: chainSnapshot.queueSize,
      backoffMs: chainSnapshot.backoffMs,
      isDegradationMode: chainSnapshot.isDegradationMode,
      updatedAtIso: chainSnapshot.updatedAtIso,
    };

    this.chainEntries.set(chainSnapshot.chainKey, entry);
    this.evaluateSloThresholds(entry);
  }

  public getChainSnapshot(chainKey: ChainKey): ChainRuntimeEntry | null {
    return this.chainEntries.get(chainKey) ?? null;
  }

  public getTelemetry(): RuntimeTelemetry {
    const byChain: Record<string, ChainRuntimeEntry> = {};

    for (const [key, entry] of this.chainEntries) {
      byChain[key] = entry;
    }

    return { byChain };
  }

  private evaluateSloThresholds(entry: ChainRuntimeEntry): void {
    const thresholds: ISloThresholds = {
      maxLagWarn: this.appConfigService.chainMaxLagWarn,
      maxQueueWarn: this.appConfigService.chainMaxQueueWarn,
      maxBackoffWarnMs: this.appConfigService.chainMaxBackoffWarnMs,
    };

    if (entry.lag !== null && thresholds.maxLagWarn > 0 && entry.lag > thresholds.maxLagWarn) {
      this.emitRateLimitedWarn(
        `slo:lag:${entry.chainKey}`,
        `SLO breach: chain=${entry.chainKey} lag=${entry.lag} threshold=${thresholds.maxLagWarn}`,
      );
    }

    if (thresholds.maxQueueWarn > 0 && entry.queueSize > thresholds.maxQueueWarn) {
      this.emitRateLimitedWarn(
        `slo:queue:${entry.chainKey}`,
        `SLO breach: chain=${entry.chainKey} queueSize=${entry.queueSize} threshold=${thresholds.maxQueueWarn}`,
      );
    }

    if (thresholds.maxBackoffWarnMs > 0 && entry.backoffMs > thresholds.maxBackoffWarnMs) {
      this.emitRateLimitedWarn(
        `slo:backoff:${entry.chainKey}`,
        `SLO breach: chain=${entry.chainKey} backoffMs=${entry.backoffMs} threshold=${thresholds.maxBackoffWarnMs}`,
      );
    }
  }

  private emitRateLimitedWarn(key: string, message: string): void {
    const now: number = Date.now();
    const lastEmittedAt: number = this.lastWarnTimestamps.get(key) ?? 0;

    if (now - lastEmittedAt < WARN_COOLDOWN_MS) {
      return;
    }

    this.lastWarnTimestamps.set(key, now);
    this.logger.warn(message);
  }
}
