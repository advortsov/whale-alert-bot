import type {
  IHistoryHotCacheChainMetrics,
  IHistoryHotCacheRefreshCounters,
} from './history-hot-cache.service.interfaces';
import type { IHistoryHotCacheRefreshResult } from '../entities/history-hot-cache.interfaces';

const DEFAULT_REFRESH_DURATION_MS = 0;

export const buildEmptyHistoryHotCacheRefreshResult = (): IHistoryHotCacheRefreshResult => {
  return {
    processedWallets: 0,
    successWallets: 0,
    failedWallets: 0,
    newItemsTotal: 0,
    duplicateItemsTotal: 0,
    durationMs: DEFAULT_REFRESH_DURATION_MS,
  };
};

export const createHistoryHotCacheRefreshCounters = (): IHistoryHotCacheRefreshCounters => {
  return {
    processedWallets: 0,
    successWallets: 0,
    failedWallets: 0,
    newItemsTotal: 0,
    duplicateItemsTotal: 0,
  };
};

export const toHistoryHotCacheRefreshResult = (
  counters: IHistoryHotCacheRefreshCounters,
  durationMs: number,
): IHistoryHotCacheRefreshResult => {
  return {
    processedWallets: counters.processedWallets,
    successWallets: counters.successWallets,
    failedWallets: counters.failedWallets,
    newItemsTotal: counters.newItemsTotal,
    duplicateItemsTotal: counters.duplicateItemsTotal,
    durationMs,
  };
};

export const createEmptyHistoryHotCacheChainMetrics = (): IHistoryHotCacheChainMetrics => {
  return {
    success: 0,
    failed: 0,
    newItems: 0,
    duplicateItems: 0,
    durationMs: 0,
  };
};
