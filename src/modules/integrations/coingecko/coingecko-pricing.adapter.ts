import { Injectable, Logger } from '@nestjs/common';

import type {
  ICoinGeckoPriceCacheEntry,
  ICoinGeckoQuoteResult,
} from './coingecko-pricing.interfaces';
import { ChainKey as KnownChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import {
  type ITokenPricingPort,
  PriceFailureReason,
  type IPriceQuoteDto,
  type IPriceRequestDto,
} from '../../../common/interfaces/token-pricing/token-pricing.interfaces';
import { registerCache, SimpleCacheImpl } from '../../../common/utils/cache';
import { executeWithExponentialBackoff } from '../../../common/utils/network/exponential-backoff.util';
import { AppConfigService } from '../../../config/app-config.service';
import {
  LimiterKey,
  RequestPriority,
} from '../../../modules/blockchain/rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../../../modules/blockchain/rate-limiting/bottleneck-rate-limiter.service';

const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const CURRENT_PRICE_MIN_REFRESH_TTL_MS = 60_000;
const COINGECKO_MAX_ATTEMPTS = 4;
const COINGECKO_NATIVE_COIN_ID: Readonly<Record<KnownChainKey, string>> = {
  [KnownChainKey.ETHEREUM_MAINNET]: 'ethereum',
  [KnownChainKey.SOLANA_MAINNET]: 'solana',
  [KnownChainKey.TRON_MAINNET]: 'tron',
};
const COINGECKO_NATIVE_SYMBOL: Readonly<Record<KnownChainKey, string>> = {
  [KnownChainKey.ETHEREUM_MAINNET]: 'ETH',
  [KnownChainKey.SOLANA_MAINNET]: 'SOL',
  [KnownChainKey.TRON_MAINNET]: 'TRX',
};

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
  private readonly cache: SimpleCacheImpl<ICoinGeckoPriceCacheEntry>;
  private readonly freshTtlMs: number;

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly rateLimiterService: BottleneckRateLimiterService,
  ) {
    this.freshTtlMs = Math.max(
      this.appConfigService.priceCacheFreshTtlSec * 1000,
      CURRENT_PRICE_MIN_REFRESH_TTL_MS,
    );
    this.cache = new SimpleCacheImpl<ICoinGeckoPriceCacheEntry>({
      ttlSec: this.appConfigService.priceCacheStaleTtlSec,
      maxKeys: this.appConfigService.priceCacheMaxEntries,
    });
    registerCache('price', this.cache as SimpleCacheImpl<unknown>);
  }

  public async getUsdQuote(request: IPriceRequestDto): Promise<IPriceQuoteDto | null> {
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

    const staleCacheEntry: ICoinGeckoPriceCacheEntry | null = this.getStaleCacheEntry(key);

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
      return await this.fetchUsdQuoteInternal(request);
    } catch (error: unknown) {
      return this.resolveQuoteError(error);
    }
  }

  private async fetchUsdQuoteInternal(request: IPriceRequestDto): Promise<ICoinGeckoQuoteResult> {
    if (this.isNativeAsset(request)) {
      return await this.fetchNativeUsdQuote(request.chainKey);
    }

    if (request.chainKey !== KnownChainKey.ETHEREUM_MAINNET) {
      return this.buildNotFoundResult();
    }

    const normalizedTokenAddress: string | null =
      request.tokenAddress?.trim().toLowerCase() ?? null;

    if (!normalizedTokenAddress) {
      return this.buildNotFoundResult();
    }

    return await this.fetchEthereumTokenUsdQuote(normalizedTokenAddress);
  }

  private async fetchNativeUsdQuote(chainKey: ChainKey): Promise<ICoinGeckoQuoteResult> {
    const nativeCoinId: string = COINGECKO_NATIVE_COIN_ID[chainKey];
    const nativeResponse: Response = await this.executeCoingeckoRequest(
      this.buildNativePriceUrl(nativeCoinId),
      nativeCoinId,
    );

    return this.mapFetchResponse(nativeResponse, nativeCoinId);
  }

  private async fetchEthereumTokenUsdQuote(
    normalizedTokenAddress: string,
  ): Promise<ICoinGeckoQuoteResult> {
    const tokenResponse: Response = await this.executeCoingeckoRequest(
      this.buildTokenPriceUrl(normalizedTokenAddress),
      normalizedTokenAddress,
    );

    return this.mapFetchResponse(tokenResponse, normalizedTokenAddress);
  }

  private buildNotFoundResult(): ICoinGeckoQuoteResult {
    return {
      usdPrice: null,
      stale: false,
      failureReason: PriceFailureReason.NOT_FOUND,
    };
  }

  private resolveQuoteError(error: unknown): ICoinGeckoQuoteResult {
    const errorMessage: string = error instanceof Error ? error.message : String(error);
    const normalizedErrorMessage: string = errorMessage.toLowerCase();

    if (normalizedErrorMessage.includes('timeout') || normalizedErrorMessage.includes('aborted')) {
      return {
        usdPrice: null,
        stale: false,
        failureReason: PriceFailureReason.TIMEOUT,
      };
    }

    if (normalizedErrorMessage.includes('429') || normalizedErrorMessage.includes('rate limit')) {
      return {
        usdPrice: null,
        stale: false,
        failureReason: PriceFailureReason.RATE_LIMIT,
      };
    }

    return {
      usdPrice: null,
      stale: false,
      failureReason: PriceFailureReason.NETWORK,
    };
  }

  private async executeCoingeckoRequest(url: URL, key: string): Promise<Response> {
    return executeWithExponentialBackoff<Response>(
      async (): Promise<Response> =>
        this.rateLimiterService.schedule(
          LimiterKey.COINGECKO,
          async (): Promise<Response> => {
            const response: Response = await fetch(url, {
              method: 'GET',
              signal: AbortSignal.timeout(this.appConfigService.coingeckoTimeoutMs),
            });

            if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
              throw new Error(`CoinGecko HTTP ${response.status}`);
            }

            if (!response.ok && response.status >= HTTP_STATUS_INTERNAL_SERVER_ERROR) {
              throw new Error(`CoinGecko HTTP ${response.status}`);
            }

            return response;
          },
          RequestPriority.NORMAL,
        ),
      {
        maxAttempts: COINGECKO_MAX_ATTEMPTS,
        baseDelayMs: this.appConfigService.chainBackoffBaseMs,
        maxDelayMs: this.appConfigService.chainBackoffMaxMs,
        shouldRetry: (error: unknown): boolean => this.shouldRetryExternalCall(error),
        onRetry: (error: unknown, attempt: number, delayMs: number): void => {
          const errorMessage: string = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `coingecko_current_retry key=${key} attempt=${String(attempt)} delayMs=${String(delayMs)} reason=${errorMessage}`,
          );
        },
      },
    );
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
    const cacheEntry: ICoinGeckoPriceCacheEntry = {
      key: input.key,
      chainKey: input.chainKey,
      tokenAddress: input.tokenAddress,
      tokenSymbol: input.tokenSymbol,
      usdPrice: input.usdPrice,
      fetchedAtEpochMs: input.nowEpochMs,
      freshUntilEpochMs: input.nowEpochMs + this.freshTtlMs,
      staleUntilEpochMs: input.nowEpochMs + this.appConfigService.priceCacheStaleTtlSec * 1000,
    };

    this.cache.set(input.key, cacheEntry);
    return cacheEntry;
  }

  private getFreshCacheEntry(key: string, nowEpochMs: number): ICoinGeckoPriceCacheEntry | null {
    const cacheEntry: ICoinGeckoPriceCacheEntry | undefined = this.cache.get(key);

    if (!cacheEntry) {
      return null;
    }

    if (nowEpochMs > cacheEntry.freshUntilEpochMs) {
      return null;
    }

    return cacheEntry;
  }

  private getStaleCacheEntry(key: string): ICoinGeckoPriceCacheEntry | null {
    const cacheEntry: ICoinGeckoPriceCacheEntry | undefined = this.cache.get(key);

    if (!cacheEntry) {
      return null;
    }

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

  private isNativeAsset(request: IPriceRequestDto): boolean {
    const normalizedAddress: string = request.tokenAddress?.trim().toLowerCase() ?? '';

    if (normalizedAddress.length > 0) {
      return normalizedAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    }

    const nativeSymbol: string = COINGECKO_NATIVE_SYMBOL[request.chainKey];

    const normalizedSymbol: string = request.tokenSymbol?.trim().toUpperCase() ?? '';
    return normalizedSymbol.length === 0 || normalizedSymbol === nativeSymbol;
  }

  private buildNativePriceUrl(nativeCoinId: string): URL {
    const url: URL = new URL('/simple/price', this.appConfigService.coingeckoApiBaseUrl);
    url.searchParams.set('ids', nativeCoinId);
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

  private shouldRetryExternalCall(error: unknown): boolean {
    const errorMessage: string = error instanceof Error ? error.message : String(error);
    const normalizedErrorMessage: string = errorMessage.toLowerCase();

    return (
      normalizedErrorMessage.includes('http 5') ||
      normalizedErrorMessage.includes('timeout') ||
      normalizedErrorMessage.includes('aborted') ||
      normalizedErrorMessage.includes('network')
    );
  }
}
