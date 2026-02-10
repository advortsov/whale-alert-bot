import type { ChainKey } from '../../../core/chains/chain-key.interfaces';
import type { PriceFailureReason } from '../../../core/ports/token-pricing/token-pricing.interfaces';

export interface CoinGeckoPriceCacheEntry {
  readonly key: string;
  readonly chainKey: ChainKey;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly usdPrice: number;
  readonly fetchedAtEpochMs: number;
  readonly freshUntilEpochMs: number;
  readonly staleUntilEpochMs: number;
}

export interface CoinGeckoQuoteResult {
  readonly usdPrice: number | null;
  readonly stale: boolean;
  readonly failureReason: PriceFailureReason | null;
}
