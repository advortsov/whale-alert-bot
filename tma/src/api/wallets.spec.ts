import { describe, expect, it, vi } from 'vitest';

import {
  addWallet,
  loadWalletHistory,
  muteWallet,
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

  it('normalizes malformed history payload to empty items', async (): Promise<void> => {
    const apiClientStub: ApiClientStub = {
      request: vi.fn().mockResolvedValue({
        message: 'history text only',
        limit: 10,
        offset: 0,
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
        },
      ],
      nextOffset: 20,
    });
  });
});
