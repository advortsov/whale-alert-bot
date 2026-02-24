export interface IHistoryHotCacheChainMetrics {
  success: number;
  failed: number;
  newItems: number;
  duplicateItems: number;
  durationMs: number;
}

export interface IHistoryHotCacheRefreshCounters {
  processedWallets: number;
  successWallets: number;
  failedWallets: number;
  newItemsTotal: number;
  duplicateItemsTotal: number;
}

export interface IHistoryHotCacheWalletRefreshStats {
  readonly newItems: number;
  readonly duplicateItems: number;
}
