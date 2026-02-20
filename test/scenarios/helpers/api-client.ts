const BASE_URL: string = process.env['SCENARIO_BASE_URL'] ?? 'http://localhost:3001';

interface IApiResponse<T = unknown> {
  readonly status: number;
  readonly body: T;
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<IApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response: Response = await fetch(`${BASE_URL}${path}`, init);

  const text: string = await response.text();
  const parsed: T = text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);

  return { status: response.status, body: parsed };
}

export function get<T = unknown>(path: string, token?: string): Promise<IApiResponse<T>> {
  return request<T>('GET', path, undefined, token);
}

export function post<T = unknown>(
  path: string,
  body: unknown,
  token?: string,
): Promise<IApiResponse<T>> {
  return request<T>('POST', path, body, token);
}

export function patch<T = unknown>(
  path: string,
  body: unknown,
  token?: string,
): Promise<IApiResponse<T>> {
  return request<T>('PATCH', path, body, token);
}

export function del<T = unknown>(path: string, token?: string): Promise<IApiResponse<T>> {
  return request<T>('DELETE', path, undefined, token);
}
