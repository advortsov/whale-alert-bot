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

  it('keeps page size constant across pages when some items are unmappable', async (): Promise<void> => {
    // Сценарий: limit=5 → targetItemsCount=6. Страница 1 возвращает 6 raw-элементов,
    // но только 2 из них TransferContract (остальные — TriggerSmartContract с amount=0,
    // маппер их пропускает). Нужна вторая страница с тем же limit=6.
    // Раньше resolvePageSize(6, 2) уменьшал limit до 4 → fingerprint mismatch.
    const makeTransfer = (txId: string, timestamp: number): Record<string, unknown> => ({
      txID: txId,
      block_timestamp: timestamp,
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
    });

    const makeTrigger = (txId: string, timestamp: number): Record<string, unknown> => ({
      txID: txId,
      block_timestamp: timestamp,
      ret: [{ contractRet: 'SUCCESS' }],
      raw_data: {
        contract: [
          {
            type: 'TriggerSmartContract',
            parameter: {
              value: {
                owner_address: '412886B63A4A06A134FD7E93B5BE37E5DCC4A36A9D',
                contract_address: '4174472E7D35395A6B5ADD427EECB7F4B62AD2B071',
              },
            },
          },
        ],
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // page 1: 6 items, 2 transfers + 4 triggers (unmappable) → 2 mapped
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              makeTransfer('tx-1', 1770000000000),
              makeTrigger('trigger-1', 1769999000000),
              makeTrigger('trigger-2', 1769998000000),
              makeTransfer('tx-2', 1769997000000),
              makeTrigger('trigger-3', 1769996000000),
              makeTrigger('trigger-4', 1769995000000),
            ],
            meta: { fingerprint: 'fp-fixed-size-test' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // page 2: 4 more transfers → all mapped, total 6 >= targetItemsCount
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              makeTransfer('tx-3', 1769994000000),
              makeTransfer('tx-4', 1769993000000),
              makeTransfer('tx-5', 1769992000000),
              makeTransfer('tx-6', 1769991000000),
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
      createRequest({ kind: HistoryKind.ETH, limit: 5 }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // page 1 and page 2 must have the same limit parameter
    const page1Url: string = toRequestUrl(fetchMock.mock.calls[0]?.[0]);
    const page2Url: string = toRequestUrl(fetchMock.mock.calls[1]?.[0]);

    const page1Limit: string | null = new URL(page1Url).searchParams.get('limit');
    const page2Limit: string | null = new URL(page2Url).searchParams.get('limit');
    expect(page1Limit).toBe('6');
    expect(page2Limit).toBe('6');

    // page 2 must carry fingerprint from page 1
    expect(page2Url).toContain('fingerprint=fp-fixed-size-test');

    expect(result.items).toHaveLength(5);
    expect(result.items[0]?.txHash).toBe('tx-1');
    expect(result.items[4]?.txHash).toBe('tx-5');
  });

  it('combines fallback policy lock and fixed page size across pages', async (): Promise<void> => {
    // Полный продакшен-сценарий:
    // 1) policy[0] (order_by) → 400
    // 2) policy[1] (без order_by) → 200, page 1 с unmappable items + fingerprint
    // 3) policy[1] (без order_by) + fingerprint + тот же limit → 200, page 2
    const makeTransfer = (txId: string, timestamp: number): Record<string, unknown> => ({
      txID: txId,
      block_timestamp: timestamp,
      ret: [{ contractRet: 'SUCCESS' }],
      raw_data: {
        contract: [
          {
            type: 'TransferContract',
            parameter: {
              value: {
                owner_address: '412886B63A4A06A134FD7E93B5BE37E5DCC4A36A9D',
                to_address: '4174472E7D35395A6B5ADD427EECB7F4B62AD2B071',
                amount: '500000',
              },
            },
          },
        ],
      },
    });

    const makeTrigger = (txId: string, timestamp: number): Record<string, unknown> => ({
      txID: txId,
      block_timestamp: timestamp,
      ret: [{ contractRet: 'SUCCESS' }],
      raw_data: {
        contract: [
          {
            type: 'TriggerSmartContract',
            parameter: {
              value: {
                owner_address: '412886B63A4A06A134FD7E93B5BE37E5DCC4A36A9D',
                contract_address: '4174472E7D35395A6B5ADD427EECB7F4B62AD2B071',
              },
            },
          },
        ],
      },
    });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // call 1: policy[0] (order_by + only_confirmed) → 400
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: 'fingerprint does not match current set of params',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
      )
      // call 2: policy[1] (only_confirmed, no order_by) → 200, mixed items + fingerprint
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              makeTransfer('combo-tx-1', 1770000000000),
              makeTrigger('combo-trigger-1', 1769999000000),
              makeTrigger('combo-trigger-2', 1769998000000),
            ],
            meta: { fingerprint: 'fp-combo' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // call 3: policy[1] + fingerprint + same limit → 200, page 2
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              makeTransfer('combo-tx-2', 1769997000000),
              makeTransfer('combo-tx-3', 1769996000000),
              makeTransfer('combo-tx-4', 1769995000000),
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
      createRequest({ kind: HistoryKind.ETH, limit: 3 }),
    );

    // 3 calls: 400 (policy[0]), 200 (policy[1] page 1), 200 (policy[1] page 2)
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const call1Url: string = toRequestUrl(fetchMock.mock.calls[0]?.[0]);
    const call2Url: string = toRequestUrl(fetchMock.mock.calls[1]?.[0]);
    const call3Url: string = toRequestUrl(fetchMock.mock.calls[2]?.[0]);

    // call 1: policy[0] — has order_by
    expect(call1Url).toContain('order_by=');

    // call 2: policy[1] — no order_by
    expect(call2Url).not.toContain('order_by=');

    // call 3: same policy[1] (no order_by), same limit, with fingerprint
    expect(call3Url).not.toContain('order_by=');
    expect(call3Url).toContain('fingerprint=fp-combo');

    const call2Limit: string | null = new URL(call2Url).searchParams.get('limit');
    const call3Limit: string | null = new URL(call3Url).searchParams.get('limit');
    expect(call2Limit).toBe(call3Limit);

    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.txHash).toBe('combo-tx-1');
    expect(result.items[1]?.txHash).toBe('combo-tx-2');
    expect(result.items[2]?.txHash).toBe('combo-tx-3');
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
