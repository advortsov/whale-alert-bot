import type { ITokens } from '../types/api.types';

export interface ITmaAuthRequest {
  readonly initData: string;
}

export const loginWithInitData = async (initData: string): Promise<ITokens> => {
  const requestBody: ITmaAuthRequest = { initData };
  const response: Response = await fetch('/api/auth/tma', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text: string = await response.text();
    throw new Error(`TMA login failed: ${response.status} ${text}`);
  }

  return (await response.json()) as ITokens;
};
