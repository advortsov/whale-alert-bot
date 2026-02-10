import { afterEach, describe, expect, it, vi } from 'vitest';

import { BaseTronRpcAdapter } from './base-tron-rpc.adapter';
import { TronAddressCodec } from '../../address/tron/tron-address.codec';

class TestTronAdapter extends BaseTronRpcAdapter {
  public constructor(httpUrl: string, tronApiKey: string | null) {
    super(httpUrl, 'tron-test-adapter', tronApiKey, new TronAddressCodec());
  }
}

describe('BaseTronRpcAdapter', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('loads latest TRON block number from getnowblock', async (): Promise<void> => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          block_header: {
            raw_data: {
              number: 80018894,
            },
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    const adapter: TestTronAdapter = new TestTronAdapter('https://api.trongrid.io', null);

    const blockNumber: number = await adapter.getLatestBlockNumber();

    expect(blockNumber).toBe(80018894);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps block transactions from TRON payload into envelope addresses', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          block_header: {
            raw_data: {
              number: 123,
              timestamp: 1_770_000_000_000,
            },
          },
          transactions: [
            {
              txID: 'trx-1',
              raw_data: {
                contract: [
                  {
                    parameter: {
                      value: {
                        owner_address: '412886B63A4A06A134FD7E93B5BE37E5DCC4A36A9D',
                        to_address: '4174472E7D35395A6B5ADD427EECB7F4B62AD2B071',
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    const adapter: TestTronAdapter = new TestTronAdapter('https://api.trongrid.io', 'test-key');

    const block = await adapter.getBlockEnvelope(123);

    expect(block).not.toBeNull();
    expect(block?.number).toBe(123);
    expect(block?.timestampSec).toBe(1_770_000_000);
    expect(block?.transactions).toHaveLength(1);
    expect(block?.transactions[0]).toEqual({
      hash: 'trx-1',
      from: 'TDfVQg3jFZNmixVYRd8DYESUQwBYU9r5KT',
      to: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
      blockTimestampSec: 1_770_000_000,
    });
  });
});
