type JsonRpcError = {
  readonly code: number;
  readonly message: string;
};

type JsonRpcResponse<T> = {
  readonly jsonrpc: string;
  readonly id: number;
  readonly result?: T;
  readonly error?: JsonRpcError;
};

type SolanaEndpointSet = {
  readonly primaryHttpUrl: string;
  readonly fallbackHttpUrl: string;
  readonly primaryWssUrl: string;
  readonly fallbackWssUrl: string;
};

const SIGNATURE_TEST_ADDRESS: string = 'Vote111111111111111111111111111111111111111';
const REQUEST_TIMEOUT_MS: number = 10000;

async function main(): Promise<void> {
  const endpoints: SolanaEndpointSet = loadEndpointSet();

  console.log('Solana HTTP smoke-check (primary)');
  await runHttpSmokeChecks(endpoints.primaryHttpUrl);

  console.log('Solana HTTP smoke-check (fallback)');
  await runHttpSmokeChecks(endpoints.fallbackHttpUrl);

  console.log('Solana WS smoke-check (primary)');
  await runWsSmokeCheck(endpoints.primaryWssUrl);

  console.log('Solana WS smoke-check (fallback)');
  await runWsSmokeCheck(endpoints.fallbackWssUrl);

  console.log('Solana RPC smoke-check passed.');
}

function loadEndpointSet(): SolanaEndpointSet {
  const primaryHttpUrl: string | undefined = process.env['SOLANA_HELIUS_HTTP_URL'];
  const fallbackHttpUrl: string | undefined = process.env['SOLANA_PUBLIC_HTTP_URL'];
  const primaryWssUrl: string | undefined = process.env['SOLANA_HELIUS_WSS_URL'];
  const fallbackWssUrl: string | undefined = process.env['SOLANA_PUBLIC_WSS_URL'];

  if (!primaryHttpUrl || !fallbackHttpUrl || !primaryWssUrl || !fallbackWssUrl) {
    throw new Error(
      [
        'Missing Solana endpoint env variables.',
        'Required: SOLANA_HELIUS_HTTP_URL, SOLANA_PUBLIC_HTTP_URL, SOLANA_HELIUS_WSS_URL, SOLANA_PUBLIC_WSS_URL.',
      ].join(' '),
    );
  }

  return {
    primaryHttpUrl,
    fallbackHttpUrl,
    primaryWssUrl,
    fallbackWssUrl,
  };
}

async function runHttpSmokeChecks(url: string): Promise<void> {
  const slotResponse: JsonRpcResponse<number> = await callRpc<number>(url, 'getSlot');
  assertRpcResult(slotResponse, 'getSlot');
  console.log(`  getSlot ok -> ${String(slotResponse.result)}`);

  const blockhashResponse: JsonRpcResponse<unknown> = await callRpc<unknown>(
    url,
    'getLatestBlockhash',
  );
  assertRpcResult(blockhashResponse, 'getLatestBlockhash');
  console.log('  getLatestBlockhash ok');

  const signaturesResponse: JsonRpcResponse<unknown> = await callRpc<unknown>(
    url,
    'getSignaturesForAddress',
    [SIGNATURE_TEST_ADDRESS, { limit: 1 }],
  );
  assertRpcResult(signaturesResponse, 'getSignaturesForAddress');
  console.log('  getSignaturesForAddress ok');
}

async function callRpc<T>(
  url: string,
  method: string,
  params: readonly unknown[] = [],
): Promise<JsonRpcResponse<T>> {
  const controller: AbortController = new AbortController();
  const timeoutHandle: NodeJS.Timeout = setTimeout((): void => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response: Response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)} ${response.statusText}`);
    }

    const jsonResponse: unknown = await response.json();
    return jsonResponse as JsonRpcResponse<T>;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function assertRpcResult<T>(response: JsonRpcResponse<T>, method: string): void {
  if (response.error) {
    throw new Error(`RPC ${method} failed: ${response.error.message}`);
  }

  if (typeof response.result === 'undefined') {
    throw new Error(`RPC ${method} returned empty result`);
  }
}

async function runWsSmokeCheck(url: string): Promise<void> {
  await new Promise<void>((resolve: () => void, reject: (error?: Error) => void): void => {
    const ws: WebSocket = new WebSocket(url);
    const timeoutHandle: NodeJS.Timeout = setTimeout((): void => {
      ws.close();
      reject(new Error(`WS timeout for ${url}`));
    }, REQUEST_TIMEOUT_MS);

    ws.onopen = (): void => {
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'slotSubscribe',
          params: [],
        }),
      );
    };

    ws.onmessage = (event: MessageEvent<unknown>): void => {
      const text: string = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);

      if (!text.includes('"result"')) {
        return;
      }

      clearTimeout(timeoutHandle);
      ws.close();
      console.log(`  ws subscribe ok -> ${text}`);
      resolve();
    };

    ws.onerror = (): void => {
      clearTimeout(timeoutHandle);
      ws.close();
      reject(new Error(`WS error for ${url}`));
    };
  });
}

void main();
