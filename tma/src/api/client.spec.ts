import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient, type IApiClientContext } from './client';
import type { ITokens } from '../types/api.types';

describe('api client', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('retries request after 401 using relogin', async (): Promise<void> => {
    const reloginMock = vi.fn<() => Promise<ITokens>>().mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    const context: IApiClientContext = {
      getAccessToken: (): string | null => {
        return 'old-access';
      },
      relogin: reloginMock,
    };

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const client = new ApiClient(context);
    const result = await client.request<{ readonly ok: boolean }>('GET', '/api/test');

    expect(reloginMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });
});
