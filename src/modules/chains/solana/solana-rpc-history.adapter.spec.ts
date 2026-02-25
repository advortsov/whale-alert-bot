import { describe, expect, it, vi } from 'vitest';

import { SolanaRpcHistoryAdapter } from './solana-rpc-history.adapter';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import { LimiterKey } from '../../blockchain/rate-limiting/bottleneck-rate-limiter.interfaces';
import type { BottleneckRateLimiterService } from '../../blockchain/rate-limiting/bottleneck-rate-limiter.service';
import { HistoryDirection, HistoryItemType } from '../../whales/entities/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../../whales/entities/history-request.dto';

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
  it('uses SOLANA_PUBLIC limiter for public endpoint requests', async (): Promise<void> => {
    const limiterKeys: LimiterKey[] = [];
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
      createJsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const configStub: SolanaConfigStub = {
      solanaHeliusHttpUrl: null,
      solanaPublicHttpUrl: 'https://public.solana.test',
    };
    const adapter: SolanaRpcHistoryAdapter = new SolanaRpcHistoryAdapter(
      configStub as unknown as AppConfigService,
      {
        schedule: async (key: LimiterKey, op: () => Promise<unknown>): Promise<unknown> => {
          limiterKeys.push(key);
          return op();
        },
      } as unknown as BottleneckRateLimiterService,
    );

    await adapter.loadRecentTransactions({
      chainKey: ChainKey.SOLANA_MAINNET,
      address: 'tracked-sol-address',
      limit: 10,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });

    expect(limiterKeys.every((key: LimiterKey): boolean => key === LimiterKey.SOLANA_PUBLIC)).toBe(
      true,
    );
  });

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
              preTokenBalances: [
                {
                  owner: 'tracked-sol-address',
                  uiTokenAmount: {
                    amount: '2000000',
                    decimals: 6,
                  },
                },
              ],
              postTokenBalances: [
                {
                  owner: 'tracked-sol-address',
                  uiTokenAmount: {
                    amount: '1000000',
                    decimals: 6,
                  },
                },
              ],
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
      valueRaw: '1000000',
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

  it('loads additional signature batches to support deep offset pagination', async (): Promise<void> => {
    const firstBatchSignatures = Array.from({ length: 1_000 }, (_value: unknown, index: number) => {
      return {
        signature: `sig-${String(index)}`,
        blockTime: 1_739_150_000 + index,
        err: null,
      };
    });
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: firstBatchSignatures,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: [
            { signature: 'sig-1000', blockTime: 1_739_151_000, err: null },
            { signature: 'sig-1001', blockTime: 1_739_151_001, err: null },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 3,
          result: {
            blockTime: 1_739_150_002,
            transaction: {
              message: {
                accountKeys: ['tracked-sol-address', 'receiver-sol-address'],
              },
            },
            meta: {
              preBalances: [4_000_000_000, 0],
              postBalances: [3_000_000_000, 0],
              err: null,
              logMessages: ['Program log: transfer'],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 4,
          result: {
            blockTime: 1_739_150_003,
            transaction: {
              message: {
                accountKeys: ['tracked-sol-address', 'receiver-sol-address'],
              },
            },
            meta: {
              preBalances: [6_000_000_000, 0],
              postBalances: [5_000_000_000, 0],
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
      offset: 1_000,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.txHash).toBe('sig-1000');
    expect(result.nextOffset).toBe(1001);

    const secondRequestInit = fetchMock.mock.calls[1]?.[1] as { readonly body?: string };
    const secondRequestBody: string =
      typeof secondRequestInit.body === 'string' ? secondRequestInit.body : '{}';
    const secondPayload = JSON.parse(secondRequestBody) as {
      readonly params?: readonly unknown[];
    };
    const secondRequestOptions = secondPayload.params?.[1] as
      | {
          readonly before?: string;
        }
      | undefined;

    expect(secondRequestOptions).toBeDefined();
    const beforeSignature: string | undefined = (
      secondRequestOptions as {
        readonly before?: string;
      }
    ).before;
    expect(beforeSignature).toBe('sig-999');
  });

  it('fills the first page by scanning deeper signatures when leading entries are unmappable', async (): Promise<void> => {
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: [
            { signature: 'sig-0', blockTime: 1_739_150_000, err: null },
            { signature: 'sig-1', blockTime: 1_739_150_001, err: null },
            { signature: 'sig-2', blockTime: 1_739_150_002, err: null },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: null,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 3,
          result: null,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 4,
          result: {
            blockTime: 1_739_150_002,
            transaction: {
              message: {
                accountKeys: ['tracked-sol-address', 'receiver-sol-address'],
              },
            },
            meta: {
              preBalances: [4_000_000_000, 0],
              postBalances: [3_000_000_000, 0],
              err: null,
              logMessages: ['Program log: transfer'],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 5,
          result: [{ signature: 'sig-3', blockTime: 1_739_150_003, err: null }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          jsonrpc: '2.0',
          id: 6,
          result: {
            blockTime: 1_739_150_003,
            transaction: {
              message: {
                accountKeys: ['tracked-sol-address', 'receiver-sol-address'],
              },
            },
            meta: {
              preBalances: [5_000_000_000, 0],
              postBalances: [4_000_000_000, 0],
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
      limit: 2,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.txHash).toBe('sig-2');
    expect(result.items[1]?.txHash).toBe('sig-3');
    expect(result.nextOffset).toBe(null);
  });
});
