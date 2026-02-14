import { Injectable, Logger } from '@nestjs/common';

import type {
  ICoinGeckoPriceCacheEntry,
  ICoinGeckoQuoteResult,
} from './coingecko-pricing.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { ChainKey as KnownChainKey } from '../../../core/chains/chain-key.interfaces';
import type { ChainKey } from '../../../core/chains/chain-key.interfaces';
import {
  type ITokenPricingPort,
  PriceFailureReason,
  type IPriceQuoteDto,
  type IPriceRequestDto,
} from '../../../core/ports/token-pricing/token-pricing.interfaces';
import {
  LimiterKey,
  RequestPriority,
} from '../../../rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../../../rate-limiting/bottleneck-rate-limiter.service';

const HTTP_STATUS_TOO_MANY_REQUESTS = 429;

type CoinGeckoCacheEntryInput = {
  readonly key: string;
  readonly chainKey: ChainKey;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly usdPrice: number;
  readonly nowEpochMs: number;
};

@Injectable()
export class CoinGeckoPricingAdapter implements ITokenPricingPort {
  private readonly logger: Logger = new Logger(CoinGeckoPricingAdapter.name);
  private readonly cache: Map<string, ICoinGeckoPriceCacheEntry> = new Map<
    string,
    ICoinGeckoPriceCacheEntry
  >();

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly rateLimiterService: BottleneckRateLimiterService,
  ) {}

  public async getUsdQuote(request: IPriceRequestDto): Promise<IPriceQuoteDto | null> {
    if (request.chainKey !== KnownChainKey.ETHEREUM_MAINNET) {
      return null;
    }

    const key: string = this.buildCacheKey(
      request.chainKey,
      request.tokenAddress,
      request.tokenSymbol,
    );
    const nowEpochMs: number = Date.now();
    const freshCacheEntry: ICoinGeckoPriceCacheEntry | null = this.getFreshCacheEntry(
      key,
      nowEpochMs,
    );

    if (freshCacheEntry !== null) {
      return this.mapCacheEntryToQuote(freshCacheEntry, false);
    }

    const quoteResult: ICoinGeckoQuoteResult = await this.fetchUsdQuote(request);

    if (quoteResult.usdPrice !== null) {
      const cacheEntry: ICoinGeckoPriceCacheEntry = this.setCacheEntry({
        key,
        chainKey: request.chainKey,
        tokenAddress: request.tokenAddress,
        tokenSymbol: request.tokenSymbol,
        usdPrice: quoteResult.usdPrice,
        nowEpochMs,
      });
      return this.mapCacheEntryToQuote(cacheEntry, false);
    }

    const staleCacheEntry: ICoinGeckoPriceCacheEntry | null = this.getStaleCacheEntry(
      key,
      nowEpochMs,
    );

    if (staleCacheEntry !== null) {
      this.logger.warn(
        `coingecko stale cache fallback key=${key} reason=${quoteResult.failureReason ?? 'n/a'}`,
      );
      return this.mapCacheEntryToQuote(staleCacheEntry, true);
    }

    return null;
  }

  private async fetchUsdQuote(request: IPriceRequestDto): Promise<ICoinGeckoQuoteResult> {
    try {
      if (this.isEthereumNative(request.tokenAddress, request.tokenSymbol)) {
        const nativeResponse: Response = await this.rateLimiterService.schedule(
          LimiterKey.COINGECKO,
          async (): Promise<Response> =>
            fetch(this.buildNativePriceUrl(), {
              method: 'GET',
              signal: AbortSignal.timeout(this.appConfigService.coingeckoTimeoutMs),
            }),
          RequestPriority.NORMAL,
        );
        return await this.mapFetchResponse(nativeResponse, 'ethereum');
      }

      const normalizedTokenAddress: string | null = request.tokenAddress?.toLowerCase() ?? null;

      if (!normalizedTokenAddress) {
        return {
          usdPrice: null,
          stale: false,
          failureReason: PriceFailureReason.NOT_FOUND,
        };
      }

      const tokenResponse: Response = await this.rateLimiterService.schedule(
        LimiterKey.COINGECKO,
        async (): Promise<Response> =>
          fetch(this.buildTokenPriceUrl(normalizedTokenAddress), {
            method: 'GET',
            signal: AbortSignal.timeout(this.appConfigService.coingeckoTimeoutMs),
          }),
        RequestPriority.NORMAL,
      );

      return await this.mapFetchResponse(tokenResponse, normalizedTokenAddress);
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      const normalizedErrorMessage: string = errorMessage.toLowerCase();

      if (
        normalizedErrorMessage.includes('timeout') ||
        normalizedErrorMessage.includes('aborted')
      ) {
        return {
          usdPrice: null,
          stale: false,
          failureReason: PriceFailureReason.TIMEOUT,
        };
      }

      return {
        usdPrice: null,
        stale: false,
        failureReason: PriceFailureReason.NETWORK,
      };
    }
  }

  private mapFetchResponse(response: Response, key: string): Promise<ICoinGeckoQuoteResult> {
    if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
      return Promise.resolve({
        usdPrice: null,
        stale: false,
        failureReason: PriceFailureReason.RATE_LIMIT,
      });
    }

    if (!response.ok) {
      return Promise.resolve({
        usdPrice: null,
        stale: false,
        failureReason: PriceFailureReason.NETWORK,
      });
    }

    return response
      .json()
      .then((payload: unknown): ICoinGeckoQuoteResult => {
        if (typeof payload !== 'object' || payload === null) {
          return {
            usdPrice: null,
            stale: false,
            failureReason: PriceFailureReason.INVALID_RESPONSE,
          };
        }

        const normalizedPayload: Record<string, unknown> = payload as Record<string, unknown>;
        const nestedPrice: unknown = normalizedPayload[key];

        if (typeof nestedPrice !== 'object' || nestedPrice === null) {
          return {
            usdPrice: null,
            stale: false,
            failureReason: PriceFailureReason.NOT_FOUND,
          };
        }

        const usdValue: unknown = (nestedPrice as Record<string, unknown>)['usd'];

        if (typeof usdValue !== 'number' || Number.isNaN(usdValue) || usdValue <= 0) {
          return {
            usdPrice: null,
            stale: false,
            failureReason: PriceFailureReason.NOT_FOUND,
          };
        }

        return {
          usdPrice: usdValue,
          stale: false,
          failureReason: null,
        };
      })
      .catch(
        (): ICoinGeckoQuoteResult => ({
          usdPrice: null,
          stale: false,
          failureReason: PriceFailureReason.INVALID_RESPONSE,
        }),
      );
  }

  private setCacheEntry(input: CoinGeckoCacheEntryInput): ICoinGeckoPriceCacheEntry {
    const freshTtlMs: number = this.appConfigService.priceCacheFreshTtlSec * 1000;
    const staleTtlMs: number = this.appConfigService.priceCacheStaleTtlSec * 1000;
    const cacheEntry: ICoinGeckoPriceCacheEntry = {
      key: input.key,
      chainKey: input.chainKey,
      tokenAddress: input.tokenAddress,
      tokenSymbol: input.tokenSymbol,
      usdPrice: input.usdPrice,
      fetchedAtEpochMs: input.nowEpochMs,
      freshUntilEpochMs: input.nowEpochMs + freshTtlMs,
      staleUntilEpochMs: input.nowEpochMs + staleTtlMs,
    };

    if (this.cache.has(input.key)) {
      this.cache.delete(input.key);
    }

    this.cache.set(input.key, cacheEntry);
    this.evictIfNeeded();
    return cacheEntry;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.appConfigService.priceCacheMaxEntries) {
      const oldestKey: string | undefined = this.cache.keys().next().value;

      if (oldestKey === undefined) {
        return;
      }

      this.cache.delete(oldestKey);
    }
  }

  private getFreshCacheEntry(key: string, nowEpochMs: number): ICoinGeckoPriceCacheEntry | null {
    const cacheEntry: ICoinGeckoPriceCacheEntry | undefined = this.cache.get(key);

    if (!cacheEntry) {
      return null;
    }

    if (nowEpochMs > cacheEntry.freshUntilEpochMs) {
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, cacheEntry);
    return cacheEntry;
  }

  private getStaleCacheEntry(key: string, nowEpochMs: number): ICoinGeckoPriceCacheEntry | null {
    const cacheEntry: ICoinGeckoPriceCacheEntry | undefined = this.cache.get(key);

    if (!cacheEntry) {
      return null;
    }

    if (nowEpochMs > cacheEntry.staleUntilEpochMs) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, cacheEntry);
    return cacheEntry;
  }

  private mapCacheEntryToQuote(
    cacheEntry: ICoinGeckoPriceCacheEntry,
    stale: boolean,
  ): IPriceQuoteDto {
    return {
      chainKey: cacheEntry.chainKey,
      tokenAddress: cacheEntry.tokenAddress,
      tokenSymbol: cacheEntry.tokenSymbol,
      usdPrice: cacheEntry.usdPrice,
      fetchedAtEpochMs: cacheEntry.fetchedAtEpochMs,
      stale,
    };
  }

  private buildCacheKey(
    chainKey: ChainKey,
    tokenAddress: string | null,
    tokenSymbol: string | null,
  ): string {
    const normalizedAddress: string = tokenAddress ? tokenAddress.toLowerCase() : 'native';
    const normalizedSymbol: string = tokenSymbol ? tokenSymbol.toUpperCase() : 'UNKNOWN';
    return `${chainKey}:${normalizedAddress}:${normalizedSymbol}`;
  }

  private isEthereumNative(tokenAddress: string | null, tokenSymbol: string | null): boolean {
    if (tokenAddress === null) {
      return tokenSymbol?.toUpperCase() === 'ETH';
    }

    return tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  }

  private buildNativePriceUrl(): URL {
    const url: URL = new URL('/simple/price', this.appConfigService.coingeckoApiBaseUrl);
    url.searchParams.set('ids', 'ethereum');
    url.searchParams.set('vs_currencies', 'usd');
    return url;
  }

  private buildTokenPriceUrl(tokenAddress: string): URL {
    const url: URL = new URL(
      '/simple/token_price/ethereum',
      this.appConfigService.coingeckoApiBaseUrl,
    );
    url.searchParams.set('contract_addresses', tokenAddress);
    url.searchParams.set('vs_currencies', 'usd');
    return url;
  }
}
