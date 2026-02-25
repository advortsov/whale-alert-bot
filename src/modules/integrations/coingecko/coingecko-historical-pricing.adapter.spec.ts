import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoinGeckoHistoricalPricingAdapter } from './coingecko-historical-pricing.adapter';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import type { BottleneckRateLimiterService } from '../../blockchain/rate-limiting/bottleneck-rate-limiter.service';

type AppConfigServiceStub = {
  readonly coingeckoApiBaseUrl: string;
  readonly coingeckoTimeoutMs: number;
  readonly chainBackoffBaseMs: number;
  readonly chainBackoffMaxMs: number;
  readonly priceHistoryCacheTtlSec: number;
  readonly priceHistoryCacheStaleSec: number;
  readonly priceHistoryCacheMaxEntries: number;
  readonly priceHistoryRangeMaxAgeDays: number;
};

const createConfigStub = (): AppConfigServiceStub => ({
  coingeckoApiBaseUrl: 'https://api.coingecko.com/api/v3',
  coingeckoTimeoutMs: 5000,
  chainBackoffBaseMs: 1000,
  chainBackoffMaxMs: 60_000,
  priceHistoryCacheTtlSec: 60,
  priceHistoryCacheStaleSec: 600,
  priceHistoryCacheMaxEntries: 100,
  priceHistoryRangeMaxAgeDays: 90,
});

describe('CoinGeckoHistoricalPricingAdapter', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns nearest range quote and reuses cache for identical bucket', async (): Promise<void> => {
    const nowSec: number = Math.floor(Date.now() / 1000);
    const txTimestampSec: number = nowSec - 120;
    const firstPointMs: number = (txTimestampSec - 20) * 1000;
    const secondPointMs: number = (txTimestampSec + 120) * 1000;
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async (): Promise<unknown> => ({
        prices: [
          [firstPointMs, 2480.5],
          [secondPointMs, 2490.25],
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter: CoinGeckoHistoricalPricingAdapter = new CoinGeckoHistoricalPricingAdapter(
      createConfigStub() as unknown as AppConfigService,
      {
        schedule: async (_k: unknown, operation: () => Promise<unknown>): Promise<unknown> =>
          operation(),
      } as unknown as BottleneckRateLimiterService,
    );

    const firstQuote = await adapter.getUsdQuoteAt({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
      timestampSec: txTimestampSec,
    });
    const secondQuote = await adapter.getUsdQuoteAt({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
      timestampSec: txTimestampSec + 10,
    });

    expect(firstQuote?.usdPrice).toBe(2480.5);
    expect(secondQuote?.usdPrice).toBe(2480.5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to daily quote for old native transaction', async (): Promise<void> => {
    const oldTimestampSec: number = Math.floor(Date.now() / 1000) - 120 * 86_400;
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async (): Promise<unknown> => ({
        market_data: {
          current_price: {
            usd: 1900.75,
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter: CoinGeckoHistoricalPricingAdapter = new CoinGeckoHistoricalPricingAdapter(
      createConfigStub() as unknown as AppConfigService,
      {
        schedule: async (_k: unknown, operation: () => Promise<unknown>): Promise<unknown> =>
          operation(),
      } as unknown as BottleneckRateLimiterService,
    );

    const quote = await adapter.getUsdQuoteAt({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
      timestampSec: oldTimestampSec,
    });

    expect(quote?.usdPrice).toBe(1900.75);
    expect(quote?.source).toBe('daily');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves stale quote when remote responds with 429', async (): Promise<void> => {
    vi.useFakeTimers();
    const nowSec: number = Math.floor(Date.now() / 1000);
    const txTimestampSec: number = nowSec - 60;
    const pointMs: number = txTimestampSec * 1000;
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async (): Promise<unknown> => ({
          prices: [[pointMs, 42.5]],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async (): Promise<unknown> => ({}),
      });
    vi.stubGlobal('fetch', fetchMock);
    const adapter: CoinGeckoHistoricalPricingAdapter = new CoinGeckoHistoricalPricingAdapter(
      {
        ...createConfigStub(),
        priceHistoryCacheTtlSec: 1,
      } as unknown as AppConfigService,
      {
        schedule: async (_k: unknown, operation: () => Promise<unknown>): Promise<unknown> =>
          operation(),
      } as unknown as BottleneckRateLimiterService,
    );

    const firstQuote = await adapter.getUsdQuoteAt({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
      timestampSec: txTimestampSec,
    });
    expect(firstQuote?.usdPrice).toBe(42.5);

    await vi.advanceTimersByTimeAsync(1500);

    const staleQuote = await adapter.getUsdQuoteAt({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
      timestampSec: txTimestampSec,
    });

    expect(staleQuote?.usdPrice).toBe(42.5);
    expect(staleQuote?.stale).toBe(true);
  });
});
