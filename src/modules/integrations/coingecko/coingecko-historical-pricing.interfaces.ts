import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { HistoricalPriceSource } from '../../../common/interfaces/token-pricing/token-pricing.interfaces';

export interface ICoinGeckoHistoricalPriceCacheEntry {
  readonly key: string;
  readonly chainKey: ChainKey;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly usdPrice: number;
  readonly source: HistoricalPriceSource;
  readonly resolvedAtSec: number;
  readonly freshUntilEpochMs: number;
  readonly staleUntilEpochMs: number;
}
