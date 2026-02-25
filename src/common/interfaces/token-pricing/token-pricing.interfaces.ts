import type { ChainKey } from '../chain-key.interfaces';

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

export enum HistoricalPriceSource {
  RANGE = 'range',
  DAILY = 'daily',
}

export interface IHistoricalPriceRequestDto {
  readonly chainKey: ChainKey;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly timestampSec: number;
}

export interface IHistoricalPriceQuoteDto {
  readonly chainKey: ChainKey;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly usdPrice: number;
  readonly source: HistoricalPriceSource;
  readonly resolvedAtSec: number;
  readonly stale: boolean;
}

export interface ITokenHistoricalPricingPort {
  getUsdQuoteAt(request: IHistoricalPriceRequestDto): Promise<IHistoricalPriceQuoteDto | null>;
}
