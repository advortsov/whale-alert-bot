import { Injectable } from '@nestjs/common';

import type { HistoryCacheEntry, HistoryCacheKey } from './history-cache.interfaces';
import { AppConfigService } from '../config/app-config.service';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';

@Injectable()
export class HistoryCacheService {
  private readonly cache: Map<string, HistoryCacheEntry> = new Map<string, HistoryCacheEntry>();

  public constructor(private readonly appConfigService: AppConfigService) {}

  public getFresh(
    address: string,
    limit: number,
    kind: HistoryKind = HistoryKind.ALL,
    direction: HistoryDirectionFilter = HistoryDirectionFilter.ALL,
    nowEpochMs: number = Date.now(),
  ): HistoryCacheEntry | null {
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
    kind: HistoryKind = HistoryKind.ALL,
    direction: HistoryDirectionFilter = HistoryDirectionFilter.ALL,
    nowEpochMs: number = Date.now(),
  ): HistoryCacheEntry | null {
    const key: string = this.buildMapKey(address, limit, kind, direction);
    const entry: HistoryCacheEntry | undefined = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.staleUntilEpochMs < nowEpochMs) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  public set(
    address: string,
    limit: number,
    message: string,
    kind: HistoryKind = HistoryKind.ALL,
    direction: HistoryDirectionFilter = HistoryDirectionFilter.ALL,
    nowEpochMs: number = Date.now(),
  ): HistoryCacheEntry {
    const key: HistoryCacheKey = {
      address: address.toLowerCase(),
      limit,
      kind,
      direction,
    };
    const freshUntilEpochMs: number = nowEpochMs + this.appConfigService.historyCacheTtlSec * 1000;
    const staleUntilEpochMs: number =
      nowEpochMs +
      Math.max(
        this.appConfigService.historyStaleOnErrorSec,
        this.appConfigService.historyCacheTtlSec,
      ) *
        1000;

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
