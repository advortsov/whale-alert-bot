import type { IHistoryItemDto, IHistoryPageDto } from './history-item.dto';
import type { HistoryDirectionFilter, HistoryKind } from './history-request.dto';
import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';

export interface IHistoryHotCacheKey {
  readonly chainKey: ChainKey;
  readonly address: string;
}

export interface IHistoryHotCacheEntry {
  readonly key: IHistoryHotCacheKey;
  readonly createdAtEpochMs: number;
  readonly freshUntilEpochMs: number;
  readonly staleUntilEpochMs: number;
  readonly items: readonly IHistoryItemDto[];
}

export interface IPopularWalletRef {
  readonly walletId: number;
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly subscriberCount: number;
}

export interface IHistoryHotCachePageRequest {
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly limit: number;
  readonly offset: number;
  readonly kind: HistoryKind;
  readonly direction: HistoryDirectionFilter;
}

export interface IHistoryHotCacheRefreshResult {
  readonly processedWallets: number;
  readonly successWallets: number;
  readonly failedWallets: number;
  readonly newItemsTotal: number;
  readonly duplicateItemsTotal: number;
  readonly durationMs: number;
}

export interface IHistoryHotCacheMetricsSnapshot {
  readonly walletsInTopSet: number;
  readonly walletsByChain: ReadonlyMap<ChainKey, number>;
  readonly avgItemsByChain: ReadonlyMap<ChainKey, number>;
}

export enum HistoryHotCacheSource {
  FRESH = 'fresh',
  STALE = 'stale',
}

export interface IHistoryHotCacheLookupResult {
  readonly source: HistoryHotCacheSource;
  readonly page: IHistoryPageDto;
}
