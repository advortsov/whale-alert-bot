import { describe, expect, it, vi } from 'vitest';

import {
  addWallet,
  loadWalletById,
  loadWallets,
  loadWalletHistory,
  muteWallet,
  normalizeWalletDetail,
  normalizeWalletHistoryResult,
  unmuteWallet,
} from './wallets';
import type { ApiClient } from './client';

type ApiClientStub = {
  readonly request: ReturnType<typeof vi.fn>;
};

describe('tma wallets api', (): void => {
  it('calls mute endpoint with minutes payload', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        walletId: 16,
        mutedUntil: '2026-02-23T12:00:00.000Z',
      }),
    };

    await muteWallet(apiClientStub as unknown as ApiClient, 16, 1440);

    expect(apiClientStub.request).toHaveBeenCalledWith('POST', '/api/wallets/16/mute', {
      minutes: 1440,
    });
  });

  it('calls unmute endpoint', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        walletId: 16,
        mutedUntil: null,
      }),
    };

    await unmuteWallet(apiClientStub as unknown as ApiClient, 16);

    expect(apiClientStub.request).toHaveBeenCalledWith('DELETE', '/api/wallets/16/mute');
  });

  it('creates wallet via track endpoint', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        walletId: 20,
      }),
    };

    await addWallet(apiClientStub as unknown as ApiClient, {
      chainKey: 'ethereum_mainnet',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      label: 'vitalik',
    });

    expect(apiClientStub.request).toHaveBeenCalledWith('POST', '/api/wallets', {
      chainKey: 'ethereum_mainnet',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      label: 'vitalik',
    });
  });

  it('normalizes legacy id field from track response into walletId', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        id: 42,
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        chainKey: 'ethereum_mainnet',
      }),
    };

    const result = await addWallet(apiClientStub as unknown as ApiClient, {
      chainKey: 'ethereum_mainnet',
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      label: 'legacy',
    });

    expect(result.walletId).toBe(42);
  });

  it('normalizes malformed history payload to empty items', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        message: 'history text only',
        limit: 10,
        offset: 0,
        hasNextPage: false,
      }),
    };

    const result = await loadWalletHistory(apiClientStub as unknown as ApiClient, 16, 0, 10);

    expect(result).toEqual({
      items: [],
      nextOffset: null,
    });
  });

  it('normalizes valid history payload and keeps typed items', (): void => {
    const result = normalizeWalletHistoryResult({
      items: [
        {
          txHash: '0xabc',
          occurredAt: '2026-02-22T00:00:00.000Z',
          eventType: 'TRANSFER',
          direction: 'IN',
          amountText: '1 ETH',
          txUrl: 'https://etherscan.io/tx/0xabc',
          assetSymbol: 'ETH',
          chainKey: 'ethereum_mainnet',
        },
        {
          txHash: 123,
        },
      ],
      nextOffset: 20,
    });

    expect(result).toEqual({
      items: [
        {
          txHash: '0xabc',
          occurredAt: '2026-02-22T00:00:00.000Z',
          eventType: 'TRANSFER',
          direction: 'IN',
          amountText: '1 ETH',
          txUrl: 'https://etherscan.io/tx/0xabc',
          assetSymbol: 'ETH',
          chainKey: 'ethereum_mainnet',
        },
      ],
      nextOffset: 20,
    });
  });

  it('derives nextOffset from paging fallback fields when explicit nextOffset is absent', (): void => {
    const result = normalizeWalletHistoryResult({
      items: [],
      hasNextPage: true,
      offset: 0,
      limit: 20,
    });

    expect(result).toEqual({
      items: [],
      nextOffset: 20,
    });
  });

  it('normalizes malformed wallet detail payload with safe string fallbacks', (): void => {
    const result = normalizeWalletDetail({
      walletId: 16,
      chainKey: '',
      address: '   ',
      label: '  ',
      activeMute: 123,
    });

    expect(result).toEqual({
      walletId: 16,
      chainKey: 'unknown_chain',
      address: '—',
      label: null,
      activeMute: null,
    });
  });

  it('supports legacy id field in wallet detail payload', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        id: 18,
        chainKey: 'tron_mainnet',
        address: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
        label: 'tron',
        activeMute: null,
      }),
    };

    const result = await loadWalletById(apiClientStub as unknown as ApiClient, 18);

    expect(result.walletId).toBe(18);
  });

  it('normalizes wallet ids provided as strings', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        wallets: [
          {
            walletId: '21',
            chainKey: 'tron_mainnet',
            address: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
            label: 'tron',
            createdAt: '2026-02-23T00:00:00.000Z',
          },
        ],
      }),
    };

    const result = await loadWallets(apiClientStub as unknown as ApiClient);

    expect(result).toHaveLength(1);
    expect(result[0]?.walletId).toBe(21);
  });

  it('filters malformed wallets from list response and keeps valid ones', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        wallets: [
          {
            walletId: 7,
            chainKey: 'ethereum_mainnet',
            address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
            label: 'vitalik',
            createdAt: '2026-02-23T00:00:00.000Z',
          },
          {
            walletId: 'broken',
          },
        ],
      }),
    };

    const result = await loadWallets(apiClientStub as unknown as ApiClient);

    expect(result).toHaveLength(1);
    expect(result[0]?.walletId).toBe(7);
  });

  it('derives nextOffset when paging fields are numeric strings', (): void => {
    const result = normalizeWalletHistoryResult({
      items: [],
      hasNextPage: true,
      offset: '10',
      limit: '5',
    });

    expect(result).toEqual({
      items: [],
      nextOffset: 15,
    });
  });
});
