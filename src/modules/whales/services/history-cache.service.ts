import { Injectable } from '@nestjs/common';

import { SimpleCacheImpl } from '../../../common/utils/cache';
import { AppConfigService } from '../../../config/app-config.service';
import type { HistoryCacheEntry, HistoryCacheKey } from '../entities/history-cache.interfaces';
import { HistoryDirectionFilter, HistoryKind } from '../entities/history-request.dto';

type HistoryCacheLookupOptions = {
  readonly kind?: HistoryKind;
  readonly direction?: HistoryDirectionFilter;
  readonly nowEpochMs?: number;
};

@Injectable()
export class HistoryCacheService {
  private readonly cache: SimpleCacheImpl<HistoryCacheEntry>;
  private readonly freshTtlMs: number;
  private readonly staleTtlMs: number;

  public constructor(private readonly appConfigService: AppConfigService) {
    const staleTtlSec: number = Math.max(
      this.appConfigService.historyStaleOnErrorSec,
      this.appConfigService.historyCacheTtlSec,
    );
    this.freshTtlMs = this.appConfigService.historyCacheTtlSec * 1000;
    this.staleTtlMs = staleTtlSec * 1000;
    this.cache = new SimpleCacheImpl<HistoryCacheEntry>({
      ttlSec: staleTtlSec,
    });
  }

  public getFresh(
    address: string,
    limit: number,
    options: HistoryCacheLookupOptions = {},
  ): HistoryCacheEntry | null {
    const kind: HistoryKind = options.kind ?? HistoryKind.ALL;
    const direction: HistoryDirectionFilter = options.direction ?? HistoryDirectionFilter.ALL;
    const nowEpochMs: number = options.nowEpochMs ?? Date.now();
    const key: string = this.buildMapKey(address, limit, kind, direction);
    const entry: HistoryCacheEntry | undefined = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.freshUntilEpochMs < nowEpochMs) {
      return null;
    }

    return entry;
  }

  public getStale(
    address: string,
    limit: number,
    options: HistoryCacheLookupOptions = {},
  ): HistoryCacheEntry | null {
    const kind: HistoryKind = options.kind ?? HistoryKind.ALL;
    const direction: HistoryDirectionFilter = options.direction ?? HistoryDirectionFilter.ALL;
    const nowEpochMs: number = options.nowEpochMs ?? Date.now();
    const key: string = this.buildMapKey(address, limit, kind, direction);
    const entry: HistoryCacheEntry | undefined = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.staleUntilEpochMs < nowEpochMs) {
      this.cache.del(key);
      return null;
    }

    return entry;
  }

  public set(
    address: string,
    limit: number,
    message: string,
    options: HistoryCacheLookupOptions = {},
  ): HistoryCacheEntry {
    const kind: HistoryKind = options.kind ?? HistoryKind.ALL;
    const direction: HistoryDirectionFilter = options.direction ?? HistoryDirectionFilter.ALL;
    const nowEpochMs: number = options.nowEpochMs ?? Date.now();
    const key: HistoryCacheKey = {
      address: address.toLowerCase(),
      limit,
      kind,
      direction,
    };
    const freshUntilEpochMs: number = nowEpochMs + this.freshTtlMs;
    const staleUntilEpochMs: number = nowEpochMs + this.staleTtlMs;

    const entry: HistoryCacheEntry = {
      key,
      message,
      createdAtEpochMs: nowEpochMs,
      freshUntilEpochMs,
      staleUntilEpochMs,
    };

    this.cache.set(this.buildMapKey(address, limit, kind, direction), entry);
    return entry;
  }

  private buildMapKey(
    address: string,
    limit: number,
    kind: HistoryKind,
    direction: HistoryDirectionFilter,
  ): string {
    return [address.toLowerCase(), String(limit), kind.toLowerCase(), direction.toLowerCase()].join(
      ':',
    );
  }
}
