import { afterEach, describe, expect, it, vi } from 'vitest';

import { TronGridHistoryAdapter } from './tron-grid-history.adapter';
import type { AppConfigService } from '../../../config/app-config.service';
import { ChainKey } from '../../../core/chains/chain-key.interfaces';
import { HistoryDirection, HistoryItemType } from '../../../features/tracking/dto/history-item.dto';
import {
  HistoryDirectionFilter,
  HistoryKind,
  type HistoryRequestDto,
} from '../../../features/tracking/dto/history-request.dto';
import { TronAddressCodec } from '../../address/tron/tron-address.codec';

type AppConfigStub = {
  readonly tronGridApiBaseUrl: string;
  readonly tronGridApiKey: string | null;
  readonly tronscanTxBaseUrl: string;
};

const createRequest = (overrides: Partial<HistoryRequestDto> = {}): HistoryRequestDto => ({
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

  it('throws for unsupported chain key', async (): Promise<void> => {
    const adapter: TronGridHistoryAdapter = new TronGridHistoryAdapter(
      {
        tronGridApiBaseUrl: 'https://api.trongrid.io',
        tronGridApiKey: null,
        tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
      } as unknown as AppConfigService,
      new TronAddressCodec(),
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
