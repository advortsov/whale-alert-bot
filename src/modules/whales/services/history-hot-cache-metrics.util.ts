import type { IHistoryHotCacheChainMetrics } from './history-hot-cache.service.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { MetricsService } from '../../observability/metrics.service';
import type { IHistoryHotCacheMetricsSnapshot } from '../entities/history-hot-cache.interfaces';

const DURATION_MS_TO_SECONDS_DIVIDER = 1000;

export const recordHistoryHotCacheMetrics = (
  metricsService: MetricsService,
  chainMetricsMap: ReadonlyMap<ChainKey, IHistoryHotCacheChainMetrics>,
): void => {
  for (const [chainKey, metrics] of chainMetricsMap) {
    if (metrics.success > 0 && metrics.failed > 0) {
      metricsService.historyHotCacheRefreshTotal.inc(
        { status: 'partial', chain: chainKey },
        metrics.success + metrics.failed,
      );
    } else if (metrics.success > 0) {
      metricsService.historyHotCacheRefreshTotal.inc(
        { status: 'success', chain: chainKey },
        metrics.success,
      );
    } else if (metrics.failed > 0) {
      metricsService.historyHotCacheRefreshTotal.inc(
        { status: 'failed', chain: chainKey },
        metrics.failed,
      );
    }

    if (metrics.newItems > 0) {
      metricsService.historyHotCacheNewItemsTotal.inc({ chain: chainKey }, metrics.newItems);
    }

    if (metrics.duplicateItems > 0) {
      metricsService.historyHotCacheDuplicateItemsTotal.inc(
        { chain: chainKey },
        metrics.duplicateItems,
      );
    }

    if (metrics.durationMs > 0) {
      metricsService.historyHotCacheRefreshDurationSeconds.observe(
        { chain: chainKey },
        metrics.durationMs / DURATION_MS_TO_SECONDS_DIVIDER,
      );
    }
  }
};

export const updateHistoryHotCacheGaugeMetrics = (
  metricsService: MetricsService,
  snapshot: IHistoryHotCacheMetricsSnapshot,
): void => {
  metricsService.historyHotCacheWalletsGauge.set(snapshot.walletsInTopSet);

  const chainKeys: readonly ChainKey[] = Object.values(ChainKey);

  for (const chainKey of chainKeys) {
    metricsService.historyHotCacheEntryItemsGauge.set({ chain: chainKey }, 0);
  }

  for (const [chainKey, avgItems] of snapshot.avgItemsByChain) {
    metricsService.historyHotCacheEntryItemsGauge.set({ chain: chainKey }, avgItems);
  }
};
