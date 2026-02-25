import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import type {
  IHistoryHotCacheChainMetrics,
  IHistoryHotCacheRefreshCounters,
  IHistoryHotCacheWalletRefreshStats,
} from './history-hot-cache.service.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { HISTORY_EXPLORER_ADAPTER } from '../../../common/interfaces/explorers/explorer-port.tokens';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import { registerCache, SimpleCacheImpl } from '../../../common/utils/cache';
import { AppConfigService } from '../../../config/app-config.service';
import { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import type { PopularTrackedWalletView } from '../../../database/repositories/subscriptions.repository.interfaces';
import { MetricsService } from '../../observability/metrics.service';
import {
  HistoryHotCacheSource,
  type IHistoryHotCacheEntry,
  type IHistoryHotCacheLookupResult,
  type IHistoryHotCacheMetricsSnapshot,
  type IHistoryHotCachePageRequest,
  type IHistoryHotCacheRefreshResult,
  type IPopularWalletRef,
} from '../entities/history-hot-cache.interfaces';
import {
  HistoryDirection,
  type IHistoryItemDto,
  type IHistoryPageDto,
} from '../entities/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../entities/history-request.dto';

const DEFAULT_REFRESH_DURATION_MS = 0;
const DEFAULT_ENTRY_COUNT = 0;
const DEFAULT_ITEM_COUNT = 0;
const IDENTITY_DELIMITER = '::';
const ITEM_MAX_MULTIPLIER = 1;
const WALLET_COUNT_DIVIDER_FALLBACK = 1;
const DURATION_MS_TO_SECONDS_DIVIDER = 1000;

@Injectable()
export class HistoryHotCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger = new Logger(HistoryHotCacheService.name);
  private readonly cache: SimpleCacheImpl<IHistoryHotCacheEntry>;
  private readonly freshTtlMs: number;
  private readonly staleTtlMs: number;
  private readonly topWalletsLimit: number;
  private readonly refreshIntervalMs: number;
  private readonly pageLimit: number;
  private readonly maxItemsPerWallet: number;
  private readonly enabled: boolean;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private refreshInProgress: boolean = false;

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    @Inject(HISTORY_EXPLORER_ADAPTER)
    private readonly historyExplorerAdapter: IHistoryExplorerAdapter,
    @Optional() private readonly metricsService: MetricsService | null = null,
  ) {
    this.enabled = this.appConfigService.historyHotCacheEnabled;
    this.topWalletsLimit = this.appConfigService.historyHotCacheTopWallets;
    this.refreshIntervalMs = this.appConfigService.historyHotCacheRefreshIntervalSec * 1000;
    this.pageLimit = this.appConfigService.historyHotCachePageLimit;
    this.maxItemsPerWallet = this.appConfigService.historyHotCacheMaxItemsPerWallet;
    this.freshTtlMs = this.appConfigService.historyHotCacheTtlSec * 1000;
    this.staleTtlMs = this.appConfigService.historyHotCacheStaleSec * 1000;
    this.cache = new SimpleCacheImpl<IHistoryHotCacheEntry>({
      ttlSec: this.appConfigService.historyHotCacheStaleSec,
      maxKeys: this.topWalletsLimit,
    });
    registerCache('history_hot_top100', this.cache as SimpleCacheImpl<unknown>);
  }

  public onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('history_hot_cache_disabled');
      return;
    }

    void this.refreshTopWallets();
    this.intervalHandle = setInterval((): void => {
      void this.refreshTopWallets();
    }, this.refreshIntervalMs);
  }

  public onModuleDestroy(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  public getFreshPage(request: IHistoryHotCachePageRequest): IHistoryHotCacheLookupResult | null {
    return this.getPageFromCache(request, false);
  }

  public getStalePage(request: IHistoryHotCachePageRequest): IHistoryHotCacheLookupResult | null {
    return this.getPageFromCache(request, true);
  }

  public getMetricsSnapshot(): IHistoryHotCacheMetricsSnapshot {
    const keys: readonly string[] = this.cache.keys();
    const walletsByChainMap: Map<ChainKey, number> = new Map<ChainKey, number>();
    const itemsByChainMap: Map<ChainKey, number> = new Map<ChainKey, number>();

    for (const key of keys) {
      const entry: IHistoryHotCacheEntry | undefined = this.cache.get(key);

      if (entry === undefined) {
        continue;
      }

      const chainKey: ChainKey = entry.key.chainKey;
      const previousWalletCount: number = walletsByChainMap.get(chainKey) ?? DEFAULT_ENTRY_COUNT;
      walletsByChainMap.set(chainKey, previousWalletCount + 1);

      const previousItemsCount: number = itemsByChainMap.get(chainKey) ?? DEFAULT_ITEM_COUNT;
      itemsByChainMap.set(chainKey, previousItemsCount + entry.items.length);
    }

    const avgItemsByChainMap: Map<ChainKey, number> = new Map<ChainKey, number>();
    for (const [chainKey, walletsCount] of walletsByChainMap) {
      const itemsCount: number = itemsByChainMap.get(chainKey) ?? DEFAULT_ITEM_COUNT;
      const divider: number =
        walletsCount <= DEFAULT_ENTRY_COUNT ? WALLET_COUNT_DIVIDER_FALLBACK : walletsCount;
      avgItemsByChainMap.set(chainKey, itemsCount / divider);
    }

    return {
      walletsInTopSet: keys.length,
      walletsByChain: walletsByChainMap,
      avgItemsByChain: avgItemsByChainMap,
    };
  }

  private async refreshTopWallets(): Promise<IHistoryHotCacheRefreshResult> {
    if (!this.enabled) {
      return this.buildEmptyRefreshResult();
    }

    if (this.refreshInProgress) {
      this.logger.debug('history_hot_cache_refresh_skip reason=already_running');
      return this.buildEmptyRefreshResult();
    }

    this.refreshInProgress = true;
    const startMs: number = Date.now();
    const counters: IHistoryHotCacheRefreshCounters = this.createRefreshCounters();
    const chainMetricsMap: Map<ChainKey, IHistoryHotCacheChainMetrics> = new Map<
      ChainKey,
      IHistoryHotCacheChainMetrics
    >();
    this.logger.debug('history_hot_cache_refresh_start');

    try {
      const walletRefs: readonly IPopularWalletRef[] = await this.loadPopularWalletRefs();
      await this.refreshWalletEntries(walletRefs, counters, chainMetricsMap);
      const result: IHistoryHotCacheRefreshResult = this.toRefreshResult(
        counters,
        Date.now() - startMs,
      );
      this.logger.debug(
        `history_hot_cache_refresh_done processed=${String(result.processedWallets)} success=${String(result.successWallets)} failed=${String(result.failedWallets)} new=${String(result.newItemsTotal)} duplicate=${String(result.duplicateItemsTotal)} durationMs=${String(result.durationMs)}`,
      );
      this.recordMetrics(chainMetricsMap);
      this.updateCacheGaugeMetrics();

      return result;
    } finally {
      this.refreshInProgress = false;
    }
  }

  private buildEmptyRefreshResult(): IHistoryHotCacheRefreshResult {
    return {
      processedWallets: 0,
      successWallets: 0,
      failedWallets: 0,
      newItemsTotal: 0,
      duplicateItemsTotal: 0,
      durationMs: DEFAULT_REFRESH_DURATION_MS,
    };
  }

  private createRefreshCounters(): IHistoryHotCacheRefreshCounters {
    return {
      processedWallets: 0,
      successWallets: 0,
      failedWallets: 0,
      newItemsTotal: 0,
      duplicateItemsTotal: 0,
    };
  }

  private async loadPopularWalletRefs(): Promise<readonly IPopularWalletRef[]> {
    const wallets: readonly PopularTrackedWalletView[] =
      await this.subscriptionsRepository.listMostPopularTrackedWallets(this.topWalletsLimit);
    return wallets.map(
      (wallet: PopularTrackedWalletView): IPopularWalletRef => ({
        walletId: wallet.walletId,
        chainKey: wallet.chainKey,
        address: wallet.address,
        subscriberCount: wallet.subscriberCount,
      }),
    );
  }

  private async refreshWalletEntries(
    walletRefs: readonly IPopularWalletRef[],
    counters: IHistoryHotCacheRefreshCounters,
    chainMetricsMap: Map<ChainKey, IHistoryHotCacheChainMetrics>,
  ): Promise<void> {
    for (const walletRef of walletRefs) {
      counters.processedWallets += 1;
      try {
        const walletStartMs: number = Date.now();
        const updateResult: IHistoryHotCacheWalletRefreshStats =
          await this.refreshWalletEntry(walletRef);
        const walletDurationMs: number = Date.now() - walletStartMs;
        counters.successWallets += 1;
        counters.newItemsTotal += updateResult.newItems;
        counters.duplicateItemsTotal += updateResult.duplicateItems;
        this.applySuccessMetrics(
          chainMetricsMap,
          walletRef.chainKey,
          updateResult,
          walletDurationMs,
        );
      } catch (error: unknown) {
        this.applyFailedMetrics(chainMetricsMap, walletRef, error);
        counters.failedWallets += 1;
      }
    }
  }

  private applySuccessMetrics(
    chainMetricsMap: Map<ChainKey, IHistoryHotCacheChainMetrics>,
    chainKey: ChainKey,
    updateResult: IHistoryHotCacheWalletRefreshStats,
    walletDurationMs: number,
  ): void {
    const metrics: IHistoryHotCacheChainMetrics =
      chainMetricsMap.get(chainKey) ?? this.createEmptyChainMetrics();
    metrics.success += 1;
    metrics.newItems += updateResult.newItems;
    metrics.duplicateItems += updateResult.duplicateItems;
    metrics.durationMs += walletDurationMs;
    chainMetricsMap.set(chainKey, metrics);
  }

  private applyFailedMetrics(
    chainMetricsMap: Map<ChainKey, IHistoryHotCacheChainMetrics>,
    walletRef: IPopularWalletRef,
    error: unknown,
  ): void {
    const metrics: IHistoryHotCacheChainMetrics =
      chainMetricsMap.get(walletRef.chainKey) ?? this.createEmptyChainMetrics();
    metrics.failed += 1;
    chainMetricsMap.set(walletRef.chainKey, metrics);
    const errorMessage: string = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `history_hot_cache_refresh_failed chain=${walletRef.chainKey} walletId=${String(walletRef.walletId)} address=${walletRef.address} reason=${errorMessage}`,
    );
  }

  private toRefreshResult(
    counters: IHistoryHotCacheRefreshCounters,
    durationMs: number,
  ): IHistoryHotCacheRefreshResult {
    return {
      processedWallets: counters.processedWallets,
      successWallets: counters.successWallets,
      failedWallets: counters.failedWallets,
      newItemsTotal: counters.newItemsTotal,
      duplicateItemsTotal: counters.duplicateItemsTotal,
      durationMs,
    };
  }

  private async refreshWalletEntry(
    walletRef: IPopularWalletRef,
  ): Promise<IHistoryHotCacheWalletRefreshStats> {
    const historyPage: IHistoryPageDto = await this.historyExplorerAdapter.loadRecentTransactions({
      chainKey: walletRef.chainKey,
      address: walletRef.address,
      limit: this.pageLimit,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });
    const cacheKey: string = this.buildCacheKey(walletRef.chainKey, walletRef.address);
    const nowEpochMs: number = Date.now();
    const existingEntry: IHistoryHotCacheEntry | undefined = this.cache.get(cacheKey);
    const existingItems: readonly IHistoryItemDto[] = existingEntry?.items ?? [];
    const identitySet: Set<string> = new Set<string>(
      existingItems.map((item: IHistoryItemDto): string => this.buildItemIdentity(item)),
    );
    const newItems: IHistoryItemDto[] = [];
    let duplicateItems: number = 0;

    for (const item of historyPage.items) {
      const itemIdentity: string = this.buildItemIdentity(item);
      if (identitySet.has(itemIdentity)) {
        duplicateItems += 1;
        continue;
      }

      identitySet.add(itemIdentity);
      newItems.push(item);
    }

    const mergedItems: readonly IHistoryItemDto[] = [...newItems, ...existingItems]
      .sort((leftItem: IHistoryItemDto, rightItem: IHistoryItemDto): number => {
        return rightItem.timestampSec - leftItem.timestampSec;
      })
      .slice(0, this.maxItemsPerWallet * ITEM_MAX_MULTIPLIER);
    const updatedEntry: IHistoryHotCacheEntry = {
      key: {
        chainKey: walletRef.chainKey,
        address: walletRef.address,
      },
      items: mergedItems,
      createdAtEpochMs: existingEntry?.createdAtEpochMs ?? nowEpochMs,
      freshUntilEpochMs: nowEpochMs + this.freshTtlMs,
      staleUntilEpochMs: nowEpochMs + this.staleTtlMs,
    };
    this.cache.set(cacheKey, updatedEntry);

    return {
      newItems: newItems.length,
      duplicateItems,
    };
  }

  private getPageFromCache(
    request: IHistoryHotCachePageRequest,
    allowStale: boolean,
  ): IHistoryHotCacheLookupResult | null {
    const cacheKey: string = this.buildCacheKey(request.chainKey, request.address);
    const entry: IHistoryHotCacheEntry | undefined = this.cache.get(cacheKey);

    if (entry === undefined) {
      return null;
    }

    const nowEpochMs: number = Date.now();

    if (entry.staleUntilEpochMs < nowEpochMs) {
      this.cache.del(cacheKey);
      return null;
    }

    const isFresh: boolean = entry.freshUntilEpochMs >= nowEpochMs;

    if (!isFresh && !allowStale) {
      return null;
    }

    const filteredItems: readonly IHistoryItemDto[] = entry.items
      .filter((item: IHistoryItemDto): boolean => this.matchKind(item, request.kind))
      .filter((item: IHistoryItemDto): boolean => this.matchDirection(item, request.direction));
    const pageItems: readonly IHistoryItemDto[] = filteredItems.slice(
      request.offset,
      request.offset + request.limit,
    );
    const nextOffset: number | null =
      filteredItems.length > request.offset + request.limit ? request.offset + request.limit : null;

    return {
      source: isFresh ? HistoryHotCacheSource.FRESH : HistoryHotCacheSource.STALE,
      page: {
        items: pageItems,
        nextOffset,
      },
    };
  }

  private buildCacheKey(chainKey: ChainKey, address: string): string {
    return `${chainKey}:${address.toLowerCase()}`;
  }

  private buildItemIdentity(item: IHistoryItemDto): string {
    return [
      item.txHash,
      item.assetSymbol,
      item.direction,
      item.valueRaw,
      String(item.timestampSec),
    ].join(IDENTITY_DELIMITER);
  }

  private matchKind(item: IHistoryItemDto, kind: HistoryKind): boolean {
    if (kind === HistoryKind.ALL) {
      return true;
    }

    const nativeSymbols: readonly string[] = ['ETH', 'SOL', 'TRX'];
    const isNativeAsset: boolean = nativeSymbols.includes(item.assetSymbol.toUpperCase());

    if (kind === HistoryKind.ETH) {
      return isNativeAsset;
    }

    return !isNativeAsset;
  }

  private matchDirection(item: IHistoryItemDto, direction: HistoryDirectionFilter): boolean {
    if (direction === HistoryDirectionFilter.ALL) {
      return true;
    }

    if (direction === HistoryDirectionFilter.IN) {
      return item.direction === HistoryDirection.IN;
    }

    return item.direction === HistoryDirection.OUT;
  }

  private createEmptyChainMetrics(): IHistoryHotCacheChainMetrics {
    return {
      success: 0,
      failed: 0,
      newItems: 0,
      duplicateItems: 0,
      durationMs: 0,
    };
  }

  private recordMetrics(
    chainMetricsMap: ReadonlyMap<ChainKey, IHistoryHotCacheChainMetrics>,
  ): void {
    if (this.metricsService === null) {
      return;
    }

    for (const [chainKey, metrics] of chainMetricsMap) {
      if (metrics.success > 0 && metrics.failed > 0) {
        this.metricsService.historyHotCacheRefreshTotal.inc(
          { status: 'partial', chain: chainKey },
          metrics.success + metrics.failed,
        );
      } else if (metrics.success > 0) {
        this.metricsService.historyHotCacheRefreshTotal.inc(
          { status: 'success', chain: chainKey },
          metrics.success,
        );
      } else if (metrics.failed > 0) {
        this.metricsService.historyHotCacheRefreshTotal.inc(
          { status: 'failed', chain: chainKey },
          metrics.failed,
        );
      }

      if (metrics.newItems > 0) {
        this.metricsService.historyHotCacheNewItemsTotal.inc({ chain: chainKey }, metrics.newItems);
      }

      if (metrics.duplicateItems > 0) {
        this.metricsService.historyHotCacheDuplicateItemsTotal.inc(
          { chain: chainKey },
          metrics.duplicateItems,
        );
      }

      if (metrics.durationMs > 0) {
        this.metricsService.historyHotCacheRefreshDurationSeconds.observe(
          { chain: chainKey },
          metrics.durationMs / DURATION_MS_TO_SECONDS_DIVIDER,
        );
      }
    }
  }

  private updateCacheGaugeMetrics(): void {
    if (this.metricsService === null) {
      return;
    }

    const snapshot: IHistoryHotCacheMetricsSnapshot = this.getMetricsSnapshot();
    this.metricsService.historyHotCacheWalletsGauge.set(snapshot.walletsInTopSet);

    const chainKeys: readonly ChainKey[] = Object.values(ChainKey);
    for (const chainKey of chainKeys) {
      this.metricsService.historyHotCacheEntryItemsGauge.set({ chain: chainKey }, 0);
    }

    for (const [chainKey, avgItems] of snapshot.avgItemsByChain) {
      this.metricsService.historyHotCacheEntryItemsGauge.set({ chain: chainKey }, avgItems);
    }
  }
}
