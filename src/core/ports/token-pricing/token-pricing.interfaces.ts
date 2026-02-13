import type { ChainKey } from '../../chains/chain-key.interfaces';

export enum PriceFailureReason {
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  NOT_FOUND = 'not_found',
  NETWORK = 'network',
  INVALID_RESPONSE = 'invalid_response',
}

export interface IPriceRequestDto {
  readonly chainKey: ChainKey;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
}

export interface IPriceQuoteDto {
  readonly chainKey: ChainKey;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly usdPrice: number;
  readonly fetchedAtEpochMs: number;
  readonly stale: boolean;
}

export interface ITokenPricingPort {
  getUsdQuote(request: IPriceRequestDto): Promise<IPriceQuoteDto | null>;
}
