import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { PriceFailureReason } from '../../../common/interfaces/token-pricing/token-pricing.interfaces';

export interface ICoinGeckoPriceCacheEntry {
  readonly key: string;
  readonly chainKey: ChainKey;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly usdPrice: number;
  readonly fetchedAtEpochMs: number;
  readonly freshUntilEpochMs: number;
  readonly staleUntilEpochMs: number;
}

export interface ICoinGeckoQuoteResult {
  readonly usdPrice: number | null;
  readonly stale: boolean;
  readonly failureReason: PriceFailureReason | null;
}
