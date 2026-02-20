import { describe, it, expect, beforeAll } from 'vitest';

import { del, get, patch, post } from './helpers/api-client';
import { loginAndGetTokens } from './helpers/auth-helper';

describe('Wallet lifecycle', () => {
  let accessToken: string;
  let walletId: string;

  const TEST_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const TEST_CHAIN_KEY = 'ethereum_mainnet';
  const TEST_LABEL = 'ScenarioTestVitalik';

  beforeAll(async () => {
    const tokens = await loginAndGetTokens();
    accessToken = tokens.accessToken;
  });

  it('should track a new wallet', async () => {
    const result = await post<{ walletId: string; isNewSubscription: boolean }>(
      '/api/wallets',
      { chainKey: TEST_CHAIN_KEY, address: TEST_ADDRESS, label: TEST_LABEL },
      accessToken,
    );

    expect(result.status).toBe(201);
    expect(result.body.walletId).toBeDefined();
    expect(typeof result.body.isNewSubscription).toBe('boolean');

    walletId = result.body.walletId;
  });

  it('should list wallets including the tracked one', async () => {
    const result = await get<{ wallets: { walletId: string }[]; totalCount: number }>(
      '/api/wallets',
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(result.body.totalCount).toBeGreaterThanOrEqual(1);

    const found = result.body.wallets.some((w) => w.walletId === walletId);
    expect(found).toBe(true);
  });

  it('should get wallet details', async () => {
    const result = await get<{ address: string }>(`/api/wallets/${walletId}`, accessToken);

    expect(result.status).toBe(200);
    expect(result.body.address).toBeDefined();
  });

  it('should mute wallet alerts', async () => {
    const result = await post<{ mutedUntil: string }>(
      `/api/wallets/${String(walletId)}/mute`,
      { minutes: 60 },
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(result.body.mutedUntil).toBeDefined();

    const mutedUntil = new Date(result.body.mutedUntil);
    expect(mutedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('should get wallet filters', async () => {
    const result = await get<{ allowTransfer: boolean; allowSwap: boolean }>(
      `/api/wallets/${String(walletId)}/filters`,
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(typeof result.body.allowTransfer).toBe('boolean');
    expect(typeof result.body.allowSwap).toBe('boolean');
  });

  it('should update wallet filters', async () => {
    const result = await patch<{ allowSwap: boolean }>(
      `/api/wallets/${String(walletId)}/filters`,
      { target: 'swap', enabled: false },
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(result.body.allowSwap).toBe(false);
  });

  it('should get wallet history', async () => {
    const result = await get<{ limit: number; offset: number; hasNextPage: boolean }>(
      `/api/wallets/${String(walletId)}/history`,
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(typeof result.body.limit).toBe('number');
    expect(typeof result.body.offset).toBe('number');
    expect(typeof result.body.hasNextPage).toBe('boolean');
  });

  it('should remove the tracked wallet', async () => {
    const result = await del<{ walletId: number | string; address: string; chainKey: string }>(
      `/api/wallets/${walletId}`,
      accessToken,
    );

    expect(result.status).toBe(200);
    expect(String(result.body.walletId)).toBe(walletId);
    expect(result.body.address).toBeDefined();
    expect(result.body.chainKey).toBeDefined();
  });

  it('should not list removed wallet', async () => {
    const result = await get<{ wallets: { walletId: string }[] }>('/api/wallets', accessToken);

    expect(result.status).toBe(200);

    const found = result.body.wallets.some((w) => w.walletId === walletId);
    expect(found).toBe(false);
  });
});
