import { describe, expect, it, vi } from 'vitest';

import { SolanaRpcHistoryAdapter } from './solana-rpc-history.adapter';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import { HistoryDirection, HistoryItemType } from '../../../features/tracking/dto/history-item.dto';
import {
  HistoryDirectionFilter,
  HistoryKind,
} from '../../../features/tracking/dto/history-request.dto';
import type { BottleneckRateLimiterService } from '../../../rate-limiting/bottleneck-rate-limiter.service';

type SolanaConfigStub = {
  readonly solanaHeliusHttpUrl: string | null;
  readonly solanaPublicHttpUrl: string | null;
};

const createJsonResponse = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async (): Promise<unknown> => payload,
  }) as unknown as Response;

describe('SolanaRpcHistoryAdapter', (): void => {
  it('loads and maps Solana history items with Solscan links', async (): Promise<void> => {
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: [
            {
              signature: 'sol-signature-1',
              blockTime: 1_739_150_000,
              err: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: {
            blockTime: 1_739_150_000,
            transaction: {
              message: {
                accountKeys: ['tracked-sol-address', 'receiver-sol-address'],
              },
            },
            meta: {
              preBalances: [5_000_000_000, 0],
              postBalances: [4_000_000_000, 0],
              err: null,
              logMessages: [
                'Program log: transfer',
                'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
              ],
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const configStub: SolanaConfigStub = {
      solanaHeliusHttpUrl: 'https://helius.solana.test',
      solanaPublicHttpUrl: 'https://public.solana.test',
    };
    const adapter: SolanaRpcHistoryAdapter = new SolanaRpcHistoryAdapter(
      configStub as unknown as AppConfigService,
      {
        schedule: async (_k: unknown, op: () => Promise<unknown>): Promise<unknown> => op(),
      } as unknown as BottleneckRateLimiterService,
    );

    const result = await adapter.loadRecentTransactions({
      chainKey: ChainKey.SOLANA_MAINNET,
      address: 'tracked-sol-address',
      limit: 1,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });

    expect(result.nextOffset).toBe(null);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      txHash: 'sol-signature-1',
      timestampSec: 1_739_150_000,
      from: 'tracked-sol-address',
      to: 'receiver-sol-address',
      valueRaw: '1000000000',
      isError: false,
      assetSymbol: 'SPL',
      assetDecimals: 6,
      eventType: HistoryItemType.TRANSFER,
      direction: HistoryDirection.OUT,
      txLink: 'https://solscan.io/tx/sol-signature-1',
    });
  });

  it('falls back to public endpoint when primary endpoint fails', async (): Promise<void> => {
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockRejectedValueOnce(new Error('primary unavailable'))
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: [],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const configStub: SolanaConfigStub = {
      solanaHeliusHttpUrl: 'https://helius.solana.test',
      solanaPublicHttpUrl: 'https://public.solana.test',
    };
    const adapter: SolanaRpcHistoryAdapter = new SolanaRpcHistoryAdapter(
      configStub as unknown as AppConfigService,
      {
        schedule: async (_k: unknown, op: () => Promise<unknown>): Promise<unknown> => op(),
      } as unknown as BottleneckRateLimiterService,
    );

    const result = await adapter.loadRecentTransactions({
      chainKey: ChainKey.SOLANA_MAINNET,
      address: 'tracked-sol-address',
      limit: 10,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });

    expect(result).toEqual({
      items: [],
      nextOffset: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://helius.solana.test');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://public.solana.test');
  });

  it('applies kind and direction filters for Solana items', async (): Promise<void> => {
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: [
            {
              signature: 'sol-signature-eth-kind',
              blockTime: 1_739_150_111,
              err: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: {
            blockTime: 1_739_150_111,
            transaction: {
              message: {
                accountKeys: ['sender-sol', 'tracked-sol-address'],
              },
            },
            meta: {
              preBalances: [0, 1_000_000_000],
              postBalances: [0, 3_000_000_000],
              err: null,
              logMessages: ['Program log: transfer'],
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const configStub: SolanaConfigStub = {
      solanaHeliusHttpUrl: 'https://helius.solana.test',
      solanaPublicHttpUrl: null,
    };
    const adapter: SolanaRpcHistoryAdapter = new SolanaRpcHistoryAdapter(
      configStub as unknown as AppConfigService,
      {
        schedule: async (_k: unknown, op: () => Promise<unknown>): Promise<unknown> => op(),
      } as unknown as BottleneckRateLimiterService,
    );

    const result = await adapter.loadRecentTransactions({
      chainKey: ChainKey.SOLANA_MAINNET,
      address: 'tracked-sol-address',
      limit: 1,
      offset: 0,
      kind: HistoryKind.ETH,
      direction: HistoryDirectionFilter.IN,
      minAmountUsd: null,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.assetSymbol).toBe('SOL');
    expect(result.items[0]?.direction).toBe(HistoryDirection.IN);
  });
});
