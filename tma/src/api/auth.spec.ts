import { afterEach, describe, expect, it, vi } from 'vitest';

import { loginWithInitData, refreshWithToken } from './auth';

describe('tma auth api', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('calls login endpoint with initData payload', async (): Promise<void> => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ accessToken: 'a', refreshToken: 'r' })));

    const result = await loginWithInitData('init-data-raw');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/tma', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: 'init-data-raw' }),
    });
    expect(result).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('calls refresh endpoint with refreshToken payload', async (): Promise<void> => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'new-a', refreshToken: 'new-r' })),
      );

    const result = await refreshWithToken('refresh-token-value');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'refresh-token-value' }),
    });
    expect(result).toEqual({ accessToken: 'new-a', refreshToken: 'new-r' });
  });
});
