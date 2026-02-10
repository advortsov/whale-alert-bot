import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoinGeckoPricingAdapter } from './coingecko-pricing.adapter';
import type { AppConfigService } from '../../../config/app-config.service';
import { ChainKey } from '../../../core/chains/chain-key.interfaces';

type AppConfigServiceStub = {
  readonly coingeckoApiBaseUrl: string;
  readonly coingeckoTimeoutMs: number;
  readonly priceCacheMaxEntries: number;
  readonly priceCacheFreshTtlSec: number;
  readonly priceCacheStaleTtlSec: number;
};

const createConfigStub = (): AppConfigServiceStub => ({
  coingeckoApiBaseUrl: 'https://api.coingecko.com/api/v3',
  coingeckoTimeoutMs: 5000,
  priceCacheMaxEntries: 2,
  priceCacheFreshTtlSec: 1,
  priceCacheStaleTtlSec: 10,
});

describe('CoinGeckoPricingAdapter', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns cached quote during fresh ttl and avoids second fetch', async (): Promise<void> => {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async (): Promise<unknown> => ({
        ethereum: {
          usd: 2500,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter: CoinGeckoPricingAdapter = new CoinGeckoPricingAdapter(
      createConfigStub() as unknown as AppConfigService,
    );

    const first = await adapter.getUsdQuote({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
    });
    const second = await adapter.getUsdQuote({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
    });

    expect(first?.usdPrice).toBe(2500);
    expect(second?.usdPrice).toBe(2500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves stale cache when remote responds with 429', async (): Promise<void> => {
    vi.useFakeTimers();
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async (): Promise<unknown> => ({
          ethereum: {
            usd: 3000,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async (): Promise<unknown> => ({}),
      });
    vi.stubGlobal('fetch', fetchMock);
    const adapter: CoinGeckoPricingAdapter = new CoinGeckoPricingAdapter(
      createConfigStub() as unknown as AppConfigService,
    );

    const first = await adapter.getUsdQuote({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
    });
    expect(first?.usdPrice).toBe(3000);

    await vi.advanceTimersByTimeAsync(1500);

    const stale = await adapter.getUsdQuote({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: null,
      tokenSymbol: 'ETH',
    });

    expect(stale?.usdPrice).toBe(3000);
    expect(stale?.stale).toBe(true);
  });

  it('evicts oldest entry when cache reaches max size', async (): Promise<void> => {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async (): Promise<unknown> => ({
        '0x1111111111111111111111111111111111111111': {
          usd: 1,
        },
        '0x2222222222222222222222222222222222222222': {
          usd: 2,
        },
        '0x3333333333333333333333333333333333333333': {
          usd: 3,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter: CoinGeckoPricingAdapter = new CoinGeckoPricingAdapter(
      createConfigStub() as unknown as AppConfigService,
    );

    await adapter.getUsdQuote({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'AAA',
    });
    await adapter.getUsdQuote({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: '0x2222222222222222222222222222222222222222',
      tokenSymbol: 'BBB',
    });
    await adapter.getUsdQuote({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: '0x3333333333333333333333333333333333333333',
      tokenSymbol: 'CCC',
    });

    await adapter.getUsdQuote({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      tokenAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'AAA',
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
