import { afterEach, describe, expect, it, vi } from 'vitest';

import { TronGridHistoryAdapter } from './tron-grid-history.adapter';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import type { BottleneckRateLimiterService } from '../../../modules/blockchain/rate-limiting/bottleneck-rate-limiter.service';
import { TronAddressCodec } from '../../../modules/chains/tron/tron-address.codec';
import { HistoryDirection, HistoryItemType } from '../../whales/entities/history-item.dto';
import {
  HistoryDirectionFilter,
  HistoryKind,
  type IHistoryRequestDto,
} from '../../whales/entities/history-request.dto';

type AppConfigStub = {
  readonly tronGridApiBaseUrl: string;
  readonly tronGridApiKey: string | null;
  readonly tronscanTxBaseUrl: string;
};

const createRequest = (overrides: Partial<IHistoryRequestDto> = {}): IHistoryRequestDto => ({
  chainKey: ChainKey.TRON_MAINNET,
  address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
  limit: 5,
  offset: 0,
  kind: HistoryKind.ALL,
  direction: HistoryDirectionFilter.ALL,
  minAmountUsd: null,
  ...overrides,
});

describe('TronGridHistoryAdapter', (): void => {
  const toRequestUrl = (input: unknown): string => {
    if (typeof input === 'string') {
      return input;
    }

    if (input instanceof URL) {
      return input.toString();
    }

    return '';
  };

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('loads TRON native history items and maps transfer fields', async (): Promise<void> => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                txID: 'native-tx-1',
                block_timestamp: 1770000000000,
                ret: [{ contractRet: 'SUCCESS' }],
                raw_data: {
                  contract: [
                    {
                      type: 'TransferContract',
                      parameter: {
                        value: {
                          owner_address: '412886B63A4A06A134FD7E93B5BE37E5DCC4A36A9D',
                          to_address: '4174472E7D35395A6B5ADD427EECB7F4B62AD2B071',
                          amount: '1500000',
                        },
                      },
                    },
                  ],
                },
              },
            ],
            meta: {},
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
            meta: {},
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      );
    const appConfigStub: AppConfigStub = {
      tronGridApiBaseUrl: 'https://api.trongrid.io',
      tronGridApiKey: null,
      tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
    };
    const adapter: TronGridHistoryAdapter = new TronGridHistoryAdapter(
      appConfigStub as unknown as AppConfigService,
      new TronAddressCodec(),
      {
        schedule: async (_k: unknown, op: () => Promise<unknown>): Promise<unknown> => op(),
      } as unknown as BottleneckRateLimiterService,
    );

    const result = await adapter.loadRecentTransactions(createRequest({ kind: HistoryKind.ETH }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.nextOffset).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      txHash: 'native-tx-1',
      timestampSec: 1770000000,
      from: 'TDfVQg3jFZNmixVYRd8DYESUQwBYU9r5KT',
      to: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
      valueRaw: '1500000',
      isError: false,
      assetSymbol: 'TRX',
      assetDecimals: 6,
      eventType: HistoryItemType.TRANSFER,
      direction: HistoryDirection.IN,
      txLink: 'https://tronscan.org/#/transaction/native-tx-1',
    });
  });

  it('loads TRC20 history and applies OUT direction filter', async (): Promise<void> => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              transaction_id: 'token-tx-out',
              block_timestamp: 1770000000000,
              from: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
              to: 'TBGttECXLudhozoRi6j6zk7jjwuHp8ucLL',
              value: '5000000',
              token_info: {
                symbol: 'USDT',
                decimals: 6,
              },
            },
            {
              transaction_id: 'token-tx-in',
              block_timestamp: 1769990000000,
              from: 'TBGttECXLudhozoRi6j6zk7jjwuHp8ucLL',
              to: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
              value: '7000000',
              token_info: {
                symbol: 'USDT',
                decimals: 6,
              },
            },
          ],
          meta: {},
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    const appConfigStub: AppConfigStub = {
      tronGridApiBaseUrl: 'https://api.trongrid.io',
      tronGridApiKey: 'test-key',
      tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
    };
    const adapter: TronGridHistoryAdapter = new TronGridHistoryAdapter(
      appConfigStub as unknown as AppConfigService,
      new TronAddressCodec(),
      {
        schedule: async (_k: unknown, op: () => Promise<unknown>): Promise<unknown> => op(),
      } as unknown as BottleneckRateLimiterService,
    );

    const result = await adapter.loadRecentTransactions(
      createRequest({
        kind: HistoryKind.ERC20,
        direction: HistoryDirectionFilter.OUT,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.txHash).toBe('token-tx-out');
    expect(result.items[0]?.assetSymbol).toBe('USDT');
    expect(result.items[0]?.direction).toBe(HistoryDirection.OUT);
  });

  it('retries TRON history request without order_by when first request returns HTTP 400', async (): Promise<void> => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: 'bad request',
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                txID: 'native-tx-after-retry',
                block_timestamp: 1770000000000,
                ret: [{ contractRet: 'SUCCESS' }],
                raw_data: {
                  contract: [
                    {
                      type: 'TransferContract',
                      parameter: {
                        value: {
                          owner_address: '412886B63A4A06A134FD7E93B5BE37E5DCC4A36A9D',
                          to_address: '4174472E7D35395A6B5ADD427EECB7F4B62AD2B071',
                          amount: '1000000',
                        },
                      },
                    },
                  ],
                },
              },
            ],
            meta: {},
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      );

    const adapter: TronGridHistoryAdapter = new TronGridHistoryAdapter(
      {
        tronGridApiBaseUrl: 'https://api.trongrid.io',
        tronGridApiKey: null,
        tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
      } as unknown as AppConfigService,
      new TronAddressCodec(),
      {
        schedule: async (_k: unknown, op: () => Promise<unknown>): Promise<unknown> => op(),
      } as unknown as BottleneckRateLimiterService,
    );

    const result = await adapter.loadRecentTransactions(createRequest({ kind: HistoryKind.ETH }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall: readonly unknown[] | undefined = fetchMock.mock.calls[0];
    const secondCall: readonly unknown[] | undefined = fetchMock.mock.calls[1];
    const firstInput: unknown = firstCall ? firstCall[0] : undefined;
    const secondInput: unknown = secondCall ? secondCall[0] : undefined;
    const firstUrl: string = toRequestUrl(firstInput);
    const secondUrl: string = toRequestUrl(secondInput);
    expect(firstUrl).toContain('order_by=block_timestamp%2Cdesc');
    expect(secondUrl).not.toContain('order_by=');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.txHash).toBe('native-tx-after-retry');
  });

  it('uses resolved fallback policy for subsequent pages after first page HTTP 400', async (): Promise<void> => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // call 1: policy[0] (with order_by) → 400
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: 'bad request' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      )
      // call 2: policy[1] (without order_by) → 200, page 1 + fingerprint
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                txID: 'native-page1-tx',
                block_timestamp: 1770000000000,
                ret: [{ contractRet: 'SUCCESS' }],
                raw_data: {
                  contract: [
                    {
                      type: 'TransferContract',
                      parameter: {
                        value: {
                          owner_address: '412886B63A4A06A134FD7E93B5BE37E5DCC4A36A9D',
                          to_address: '4174472E7D35395A6B5ADD427EECB7F4B62AD2B071',
                          amount: '1000000',
                        },
                      },
                    },
                  ],
                },
              },
            ],
            meta: { fingerprint: 'fp-page1' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // call 3: policy[1] (without order_by) + fingerprint → 200, page 2
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                txID: 'native-page2-tx',
                block_timestamp: 1769990000000,
                ret: [{ contractRet: 'SUCCESS' }],
                raw_data: {
                  contract: [
                    {
                      type: 'TransferContract',
                      parameter: {
                        value: {
                          owner_address: '412886B63A4A06A134FD7E93B5BE37E5DCC4A36A9D',
                          to_address: '4174472E7D35395A6B5ADD427EECB7F4B62AD2B071',
                          amount: '2000000',
                        },
                      },
                    },
                  ],
                },
              },
            ],
            meta: {},
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const adapter: TronGridHistoryAdapter = new TronGridHistoryAdapter(
      {
        tronGridApiBaseUrl: 'https://api.trongrid.io',
        tronGridApiKey: null,
        tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
      } as unknown as AppConfigService,
      new TronAddressCodec(),
      {
        schedule: async (_k: unknown, op: () => Promise<unknown>): Promise<unknown> => op(),
      } as unknown as BottleneckRateLimiterService,
    );

    const result = await adapter.loadRecentTransactions(
      createRequest({ kind: HistoryKind.ETH, limit: 10 }),
    );

    // 3 fetch calls: 400, 200 (page 1), 200 (page 2)
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const thirdCall: readonly unknown[] | undefined = fetchMock.mock.calls[2];
    const thirdInput: unknown = thirdCall ? thirdCall[0] : undefined;
    const thirdUrl: string = toRequestUrl(thirdInput);

    // page 2 must NOT contain order_by (policy was locked to fallback from page 1)
    expect(thirdUrl).not.toContain('order_by=');
    // page 2 must contain the fingerprint from page 1
    expect(thirdUrl).toContain('fingerprint=fp-page1');

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.txHash).toBe('native-page1-tx');
    expect(result.items[1]?.txHash).toBe('native-page2-tx');
  });

  it('throws for unsupported chain key', async (): Promise<void> => {
    const adapter: TronGridHistoryAdapter = new TronGridHistoryAdapter(
      {
        tronGridApiBaseUrl: 'https://api.trongrid.io',
        tronGridApiKey: null,
        tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
      } as unknown as AppConfigService,
      new TronAddressCodec(),
      {
        schedule: async (_k: unknown, op: () => Promise<unknown>): Promise<unknown> => op(),
      } as unknown as BottleneckRateLimiterService,
    );

    await expect(
      adapter.loadRecentTransactions(
        createRequest({
          chainKey: ChainKey.ETHEREUM_MAINNET,
        }),
      ),
    ).rejects.toThrow('TRON history adapter does not support chain ethereum_mainnet.');
  });
});
