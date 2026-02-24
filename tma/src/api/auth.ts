import type { ITokens } from '../types/api.types';

export interface ITmaAuthRequest {
  readonly initData: string;
}

export interface IRefreshAuthRequest {
  readonly refreshToken: string;
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

export const refreshWithToken = async (refreshToken: string): Promise<ITokens> => {
  const requestBody: IRefreshAuthRequest = { refreshToken };
  const response: Response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text: string = await response.text();
    throw new Error(`TMA refresh failed: ${response.status} ${text}`);
  }

  return (await response.json()) as ITokens;
};
