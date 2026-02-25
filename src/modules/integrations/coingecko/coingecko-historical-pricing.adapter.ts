import { Injectable, Logger } from '@nestjs/common';

import type { ICoinGeckoHistoricalPriceCacheEntry } from './coingecko-historical-pricing.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type {
  IHistoricalPriceQuoteDto,
  IHistoricalPriceRequestDto,
  ITokenHistoricalPricingPort,
} from '../../../common/interfaces/token-pricing/token-pricing.interfaces';
import { HistoricalPriceSource } from '../../../common/interfaces/token-pricing/token-pricing.interfaces';
import { registerCache, SimpleCacheImpl } from '../../../common/utils/cache';
import { AppConfigService } from '../../../config/app-config.service';
import {
  LimiterKey,
  RequestPriority,
} from '../../blockchain/rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../../blockchain/rate-limiting/bottleneck-rate-limiter.service';

const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const RANGE_BUCKET_SEC = 300;
const RANGE_PADDING_SEC = 300;
const SEC_IN_DAY = 86_400;
const COINGECKO_CHAIN_ASSET_MAP: Readonly<
  Record<ChainKey, { readonly coinId: string; readonly nativeSymbol: string }>
> = {
  [ChainKey.ETHEREUM_MAINNET]: {
    coinId: 'ethereum',
    nativeSymbol: 'ETH',
  },
  [ChainKey.SOLANA_MAINNET]: {
    coinId: 'solana',
    nativeSymbol: 'SOL',
  },
  [ChainKey.TRON_MAINNET]: {
    coinId: 'tron',
    nativeSymbol: 'TRX',
  },
};

@Injectable()
export class CoinGeckoHistoricalPricingAdapter implements ITokenHistoricalPricingPort {
  private readonly logger: Logger = new Logger(CoinGeckoHistoricalPricingAdapter.name);
  private readonly cache: SimpleCacheImpl<ICoinGeckoHistoricalPriceCacheEntry>;
  private readonly freshTtlMs: number;

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly rateLimiterService: BottleneckRateLimiterService,
  ) {
    this.cache = new SimpleCacheImpl<ICoinGeckoHistoricalPriceCacheEntry>({
      ttlSec: this.appConfigService.priceHistoryCacheStaleSec,
      maxKeys: this.appConfigService.priceHistoryCacheMaxEntries,
    });
    this.freshTtlMs = this.appConfigService.priceHistoryCacheTtlSec * 1000;
    registerCache('price_history', this.cache as SimpleCacheImpl<unknown>);
  }

  public async getUsdQuoteAt(
    request: IHistoricalPriceRequestDto,
  ): Promise<IHistoricalPriceQuoteDto | null> {
    const cacheKey: string = this.buildCacheKey(request);
    const nowEpochMs: number = Date.now();
    const freshCacheEntry: ICoinGeckoHistoricalPriceCacheEntry | null = this.getFreshCacheEntry(
      cacheKey,
      nowEpochMs,
    );

    if (freshCacheEntry !== null) {
      return this.toQuote(freshCacheEntry, false);
    }

    const fetchedQuote: IHistoricalPriceQuoteDto | null = await this.fetchQuote(request);

    if (fetchedQuote !== null) {
      this.setCacheEntry(cacheKey, request, fetchedQuote, nowEpochMs);
      return fetchedQuote;
    }

    const staleCacheEntry: ICoinGeckoHistoricalPriceCacheEntry | null =
      this.getStaleCacheEntry(cacheKey);

    if (staleCacheEntry !== null) {
      this.logger.warn(`coingecko historical stale fallback key=${cacheKey}`);
      return this.toQuote(staleCacheEntry, true);
    }

    return null;
  }

  private async fetchQuote(
    request: IHistoricalPriceRequestDto,
  ): Promise<IHistoricalPriceQuoteDto | null> {
    const isNativeAsset: boolean = this.isNativeAsset(request);
    const ageSec: number = Math.max(Math.floor(Date.now() / 1000) - request.timestampSec, 0);
    const useRangeStrategy: boolean =
      ageSec <= this.appConfigService.priceHistoryRangeMaxAgeDays * SEC_IN_DAY || !isNativeAsset;
    const rangeQuote: IHistoricalPriceQuoteDto | null = useRangeStrategy
      ? await this.fetchRangeQuote(request, isNativeAsset)
      : null;

    if (rangeQuote !== null) {
      return rangeQuote;
    }

    if (!isNativeAsset) {
      return null;
    }

    return this.fetchDailyQuote(request);
  }

  private async fetchRangeQuote(
    request: IHistoricalPriceRequestDto,
    isNativeAsset: boolean,
  ): Promise<IHistoricalPriceQuoteDto | null> {
    if (
      !isNativeAsset &&
      (request.tokenAddress === null || request.tokenAddress.trim().length === 0)
    ) {
      return null;
    }

    const endpointUrl: URL = isNativeAsset
      ? this.buildNativeRangeUrl(request.chainKey, request.timestampSec)
      : this.buildContractRangeUrl(request.chainKey, request.tokenAddress, request.timestampSec);

    const payload: unknown = await this.fetchJson(endpointUrl);

    if (payload === null) {
      return null;
    }

    const prices: readonly unknown[] = this.extractArrayField(payload, 'prices');

    if (prices.length === 0) {
      return null;
    }

    const targetTimestampMs: number = request.timestampSec * 1000;
    const nearestPoint: { readonly timestampMs: number; readonly usdPrice: number } | null =
      this.resolveNearestRangePoint(prices, targetTimestampMs);

    if (nearestPoint === null) {
      return null;
    }

    return {
      chainKey: request.chainKey,
      tokenAddress: request.tokenAddress,
      tokenSymbol: request.tokenSymbol,
      usdPrice: nearestPoint.usdPrice,
      source: HistoricalPriceSource.RANGE,
      resolvedAtSec: Math.floor(nearestPoint.timestampMs / 1000),
      stale: false,
    };
  }

  private async fetchDailyQuote(
    request: IHistoricalPriceRequestDto,
  ): Promise<IHistoricalPriceQuoteDto | null> {
    const coinId: string = this.resolveNativeCoinId(request.chainKey);

    const endpointUrl: URL = new URL(
      `/coins/${coinId}/history`,
      this.appConfigService.coingeckoApiBaseUrl,
    );
    endpointUrl.searchParams.set('date', this.toDailyDate(request.timestampSec));
    endpointUrl.searchParams.set('localization', 'false');

    const payload: unknown = await this.fetchJson(endpointUrl);

    if (payload === null || typeof payload !== 'object') {
      return null;
    }

    const marketData: unknown = (payload as Record<string, unknown>)['market_data'];

    if (typeof marketData !== 'object' || marketData === null) {
      return null;
    }

    const currentPrice: unknown = (marketData as Record<string, unknown>)['current_price'];

    if (typeof currentPrice !== 'object' || currentPrice === null) {
      return null;
    }

    const usdPriceRaw: unknown = (currentPrice as Record<string, unknown>)['usd'];
    const usdPrice: number = this.toFiniteNumber(usdPriceRaw);

    if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
      return null;
    }

    return {
      chainKey: request.chainKey,
      tokenAddress: request.tokenAddress,
      tokenSymbol: request.tokenSymbol,
      usdPrice,
      source: HistoricalPriceSource.DAILY,
      resolvedAtSec: request.timestampSec,
      stale: false,
    };
  }

  private async fetchJson(url: URL): Promise<unknown> {
    try {
      const response: Response = await this.rateLimiterService.schedule(
        LimiterKey.COINGECKO_HISTORY,
        async (): Promise<Response> =>
          fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(this.appConfigService.coingeckoTimeoutMs),
          }),
        RequestPriority.NORMAL,
      );

      if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
        this.logger.warn(`coingecko historical 429 url=${url.pathname}`);
        return null;
      }

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`coingecko historical request failed reason=${errorMessage}`);
      return null;
    }
  }

  private buildNativeRangeUrl(chainKey: ChainKey, timestampSec: number): URL {
    const coinId: string = this.resolveNativeCoinId(chainKey);
    const url: URL = new URL(
      `/coins/${coinId}/market_chart/range`,
      this.appConfigService.coingeckoApiBaseUrl,
    );
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('from', String(timestampSec - RANGE_PADDING_SEC));
    url.searchParams.set('to', String(timestampSec + RANGE_PADDING_SEC));
    return url;
  }

  private buildContractRangeUrl(
    chainKey: ChainKey,
    tokenAddress: string | null,
    timestampSec: number,
  ): URL {
    if (tokenAddress === null || tokenAddress.trim().length === 0) {
      throw new Error('Token address is required for historical range query.');
    }

    const platformId: string = this.resolvePlatformId(chainKey);

    const normalizedTokenAddress: string =
      chainKey === ChainKey.ETHEREUM_MAINNET ? tokenAddress.toLowerCase() : tokenAddress;
    const url: URL = new URL(
      `/coins/${platformId}/contract/${normalizedTokenAddress}/market_chart/range`,
      this.appConfigService.coingeckoApiBaseUrl,
    );
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('from', String(timestampSec - RANGE_PADDING_SEC));
    url.searchParams.set('to', String(timestampSec + RANGE_PADDING_SEC));
    return url;
  }

  private resolveNearestRangePoint(
    prices: readonly unknown[],
    targetTimestampMs: number,
  ): { readonly timestampMs: number; readonly usdPrice: number } | null {
    let nearestPoint: { readonly timestampMs: number; readonly usdPrice: number } | null = null;

    for (const rawPoint of prices) {
      if (!Array.isArray(rawPoint) || rawPoint.length < 2) {
        continue;
      }

      const timestampMs: number = this.toFiniteNumber(rawPoint[0]);
      const usdPrice: number = this.toFiniteNumber(rawPoint[1]);

      if (!Number.isFinite(timestampMs) || !Number.isFinite(usdPrice) || usdPrice <= 0) {
        continue;
      }

      if (nearestPoint === null) {
        nearestPoint = {
          timestampMs,
          usdPrice,
        };
        continue;
      }

      const currentDistanceMs: number = Math.abs(targetTimestampMs - timestampMs);
      const bestDistanceMs: number = Math.abs(targetTimestampMs - nearestPoint.timestampMs);

      if (currentDistanceMs < bestDistanceMs) {
        nearestPoint = {
          timestampMs,
          usdPrice,
        };
      }
    }

    return nearestPoint;
  }

  private resolveNativeCoinId(chainKey: ChainKey): string {
    return COINGECKO_CHAIN_ASSET_MAP[chainKey].coinId;
  }

  private resolvePlatformId(chainKey: ChainKey): string {
    return COINGECKO_CHAIN_ASSET_MAP[chainKey].coinId;
  }

  private isNativeAsset(request: IHistoricalPriceRequestDto): boolean {
    if (request.tokenAddress !== null && request.tokenAddress.trim().length > 0) {
      return false;
    }

    const symbol: string = (request.tokenSymbol ?? '').trim().toUpperCase();
    const nativeSymbol: string = COINGECKO_CHAIN_ASSET_MAP[request.chainKey].nativeSymbol;
    return symbol.length === 0 || symbol === nativeSymbol;
  }

  private buildCacheKey(request: IHistoricalPriceRequestDto): string {
    const tokenAddress: string =
      request.tokenAddress !== null && request.tokenAddress.trim().length > 0
        ? request.tokenAddress.toLowerCase()
        : 'native';
    const bucketSec: number =
      Math.floor(request.timestampSec / RANGE_BUCKET_SEC) * RANGE_BUCKET_SEC;
    return `${request.chainKey}:${tokenAddress}:${bucketSec}`;
  }

  private setCacheEntry(
    key: string,
    request: IHistoricalPriceRequestDto,
    quote: IHistoricalPriceQuoteDto,
    nowEpochMs: number,
  ): void {
    const entry: ICoinGeckoHistoricalPriceCacheEntry = {
      key,
      chainKey: request.chainKey,
      tokenAddress: request.tokenAddress,
      tokenSymbol: request.tokenSymbol,
      usdPrice: quote.usdPrice,
      source: quote.source,
      resolvedAtSec: quote.resolvedAtSec,
      freshUntilEpochMs: nowEpochMs + this.freshTtlMs,
      staleUntilEpochMs: nowEpochMs + this.appConfigService.priceHistoryCacheStaleSec * 1000,
    };
    this.cache.set(key, entry);
  }

  private getFreshCacheEntry(
    key: string,
    nowEpochMs: number,
  ): ICoinGeckoHistoricalPriceCacheEntry | null {
    const entry: ICoinGeckoHistoricalPriceCacheEntry | undefined = this.cache.get(key);

    if (entry === undefined) {
      return null;
    }

    if (nowEpochMs > entry.freshUntilEpochMs) {
      return null;
    }

    return entry;
  }

  private getStaleCacheEntry(key: string): ICoinGeckoHistoricalPriceCacheEntry | null {
    const entry: ICoinGeckoHistoricalPriceCacheEntry | undefined = this.cache.get(key);
    return entry ?? null;
  }

  private toQuote(
    entry: ICoinGeckoHistoricalPriceCacheEntry,
    stale: boolean,
  ): IHistoricalPriceQuoteDto {
    return {
      chainKey: entry.chainKey,
      tokenAddress: entry.tokenAddress,
      tokenSymbol: entry.tokenSymbol,
      usdPrice: entry.usdPrice,
      source: entry.source,
      resolvedAtSec: entry.resolvedAtSec,
      stale,
    };
  }

  private extractArrayField(payload: unknown, key: string): readonly unknown[] {
    if (typeof payload !== 'object' || payload === null) {
      return [];
    }

    const fieldValue: unknown = (payload as Record<string, unknown>)[key];

    if (!Array.isArray(fieldValue)) {
      return [];
    }

    return fieldValue;
  }

  private toFiniteNumber(rawValue: unknown): number {
    if (typeof rawValue === 'number') {
      return rawValue;
    }

    if (typeof rawValue === 'string') {
      const parsedValue: number = Number.parseFloat(rawValue);
      return parsedValue;
    }

    return Number.NaN;
  }

  private toDailyDate(timestampSec: number): string {
    const date: Date = new Date(timestampSec * 1000);
    const day: string = String(date.getUTCDate()).padStart(2, '0');
    const month: string = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year: string = String(date.getUTCFullYear());
    return `${day}-${month}-${year}`;
  }
}
