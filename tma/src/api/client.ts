import type { ITokens } from '../types/api.types';

const UNAUTHORIZED_HTTP_STATUS = 401;

const resolveApiBaseUrl = (): string => {
  const env = import.meta.env as { readonly VITE_API_BASE_URL?: unknown };
  const configuredBaseUrl: unknown = env.VITE_API_BASE_URL;

  if (typeof configuredBaseUrl === 'string' && configuredBaseUrl.trim().length > 0) {
    return configuredBaseUrl;
  }

  return '';
};

const API_BASE_URL: string = resolveApiBaseUrl();

export interface IApiClientContext {
  getAccessToken(): string | null;
  relogin(): Promise<ITokens>;
}

export class ApiClient {
  public constructor(private readonly context: IApiClientContext) {}

  public async request<TResponse>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    withAuth: boolean = true,
  ): Promise<TResponse> {
    const executeRequest = async (): Promise<Response> => {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      const accessToken: string | null = this.context.getAccessToken();

      if (withAuth && accessToken !== null) {
        headers.authorization = `Bearer ${accessToken}`;
      }

      return fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    };

    let response: Response = await executeRequest();

    if (response.status === UNAUTHORIZED_HTTP_STATUS && withAuth) {
      await this.context.relogin();
      response = await executeRequest();
    }

    if (!response.ok) {
      const errorText: string = await response.text();
      throw new Error(`API ${path} failed: ${response.status} ${errorText}`);
    }

    const responsePayload: unknown = await response.json();
    return responsePayload as TResponse;
  }
}
