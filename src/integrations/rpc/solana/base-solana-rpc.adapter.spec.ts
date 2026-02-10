import { describe, expect, it, vi } from 'vitest';

import { BaseSolanaRpcAdapter } from './base-solana-rpc.adapter';

class SolanaAdapterTestImpl extends BaseSolanaRpcAdapter {
  public constructor() {
    super('https://solana.test/rpc', 'wss://solana.test/ws', 'solana-test');
  }
}

const createResponse = (payload: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async (): Promise<unknown> => payload,
  }) as unknown as Response;

describe('BaseSolanaRpcAdapter', (): void => {
  it('maps getBlock response to generic block envelope', async (): Promise<void> => {
    const adapter: SolanaAdapterTestImpl = new SolanaAdapterTestImpl();
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
      createResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          blockTime: 1_737_500_000,
          transactions: [
            {
              transaction: {
                signatures: ['sol-signature-1'],
                message: {
                  accountKeys: ['from-sol-address', 'to-sol-address'],
                },
              },
            },
          ],
        },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const blockEnvelope = await adapter.getBlockEnvelope(123);

    expect(blockEnvelope).toEqual({
      number: 123,
      timestampSec: 1_737_500_000,
      transactions: [
        {
          hash: 'sol-signature-1',
          from: 'from-sol-address',
          to: 'to-sol-address',
          blockTimestampSec: 1_737_500_000,
        },
      ],
    });
  });

  it('maps getTransaction logs to generic receipt envelope', async (): Promise<void> => {
    const adapter: SolanaAdapterTestImpl = new SolanaAdapterTestImpl();
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
      createResponse({
        jsonrpc: '2.0',
        id: 1,
        result: {
          meta: {
            logMessages: ['Program log: transfer', 'Program log: success'],
          },
        },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const receiptEnvelope = await adapter.getReceiptEnvelope('sol-signature-1');

    expect(receiptEnvelope).toEqual({
      txHash: 'sol-signature-1',
      logs: [
        {
          address: 'solana-log',
          topics: [],
          data: 'Program log: transfer',
          logIndex: 0,
        },
        {
          address: 'solana-log',
          topics: [],
          data: 'Program log: success',
          logIndex: 1,
        },
      ],
    });
  });

  it('returns healthy state when getSlot succeeds', async (): Promise<void> => {
    const adapter: SolanaAdapterTestImpl = new SolanaAdapterTestImpl();
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
      createResponse({
        jsonrpc: '2.0',
        id: 1,
        result: 123456,
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const health = await adapter.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.details).toContain('slot=123456');
  });

  it('returns degraded state when rpc responds with error payload', async (): Promise<void> => {
    const adapter: SolanaAdapterTestImpl = new SolanaAdapterTestImpl();
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
      createResponse({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32000,
          message: 'rpc unavailable',
        },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const health = await adapter.healthCheck();

    expect(health.ok).toBe(false);
    expect(health.details).toContain('rpc unavailable');
  });

  it('returns null block when slot was skipped in solana rpc', async (): Promise<void> => {
    const adapter: SolanaAdapterTestImpl = new SolanaAdapterTestImpl();
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
      createResponse({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32007,
          message: 'Slot 123 was skipped, or missing due to ledger jump to recent snapshot',
        },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const blockEnvelope = await adapter.getBlockEnvelope(123);

    expect(blockEnvelope).toBeNull();
  });
});
