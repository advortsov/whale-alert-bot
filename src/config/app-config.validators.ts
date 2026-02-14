import type { ParsedEnv } from './app-config.schema';

export function assertWatcherConfig(parsedEnv: ParsedEnv): void {
  assertBackoffConfig(parsedEnv);
  assertCatchupConfig(parsedEnv);
  assertCacheConfig(parsedEnv);
  assertEthereumWatcherConfig(parsedEnv);
  assertSolanaWatcherConfig(parsedEnv);
  assertTronWatcherConfig(parsedEnv);
}

function assertBackoffConfig(parsedEnv: ParsedEnv): void {
  if (parsedEnv.CHAIN_BACKOFF_MAX_MS < parsedEnv.CHAIN_BACKOFF_BASE_MS) {
    throw new Error('CHAIN_BACKOFF_MAX_MS must be >= CHAIN_BACKOFF_BASE_MS');
  }

  if (parsedEnv.CHAIN_BACKOFF_MAX_MS < parsedEnv.CHAIN_SOLANA_BACKOFF_BASE_MS) {
    throw new Error('CHAIN_BACKOFF_MAX_MS must be >= CHAIN_SOLANA_BACKOFF_BASE_MS');
  }
}

function assertCatchupConfig(parsedEnv: ParsedEnv): void {
  if (parsedEnv.CHAIN_SOLANA_CATCHUP_BATCH > parsedEnv.CHAIN_SOLANA_QUEUE_MAX) {
    throw new Error('CHAIN_SOLANA_CATCHUP_BATCH must be <= CHAIN_SOLANA_QUEUE_MAX');
  }

  if (parsedEnv.CHAIN_TRON_CATCHUP_BATCH > parsedEnv.CHAIN_TRON_QUEUE_MAX) {
    throw new Error('CHAIN_TRON_CATCHUP_BATCH must be <= CHAIN_TRON_QUEUE_MAX');
  }
}

function assertCacheConfig(parsedEnv: ParsedEnv): void {
  if (parsedEnv.PRICE_CACHE_STALE_TTL_SEC < parsedEnv.PRICE_CACHE_FRESH_TTL_SEC) {
    throw new Error('PRICE_CACHE_STALE_TTL_SEC must be >= PRICE_CACHE_FRESH_TTL_SEC');
  }
}

function assertEthereumWatcherConfig(parsedEnv: ParsedEnv): void {
  if (parsedEnv.CHAIN_WATCHER_ENABLED) {
    if (!parsedEnv.ETH_ALCHEMY_WSS_URL) {
      throw new Error('ETH_ALCHEMY_WSS_URL is required when CHAIN_WATCHER_ENABLED=true');
    }

    if (!parsedEnv.ETH_INFURA_WSS_URL) {
      throw new Error('ETH_INFURA_WSS_URL is required when CHAIN_WATCHER_ENABLED=true');
    }
  }
}

function assertSolanaWatcherConfig(parsedEnv: ParsedEnv): void {
  if (parsedEnv.SOLANA_WATCHER_ENABLED) {
    if (!parsedEnv.SOLANA_HELIUS_HTTP_URL) {
      throw new Error('SOLANA_HELIUS_HTTP_URL is required when SOLANA_WATCHER_ENABLED=true');
    }

    if (!parsedEnv.SOLANA_HELIUS_WSS_URL) {
      throw new Error('SOLANA_HELIUS_WSS_URL is required when SOLANA_WATCHER_ENABLED=true');
    }

    if (!parsedEnv.SOLANA_PUBLIC_HTTP_URL) {
      throw new Error('SOLANA_PUBLIC_HTTP_URL is required when SOLANA_WATCHER_ENABLED=true');
    }

    if (!parsedEnv.SOLANA_PUBLIC_WSS_URL) {
      throw new Error('SOLANA_PUBLIC_WSS_URL is required when SOLANA_WATCHER_ENABLED=true');
    }
  }
}

function assertTronWatcherConfig(parsedEnv: ParsedEnv): void {
  if (parsedEnv.TRON_WATCHER_ENABLED) {
    if (!parsedEnv.TRON_PRIMARY_HTTP_URL) {
      throw new Error('TRON_PRIMARY_HTTP_URL is required when TRON_WATCHER_ENABLED=true');
    }

    if (!parsedEnv.TRON_FALLBACK_HTTP_URL) {
      throw new Error('TRON_FALLBACK_HTTP_URL is required when TRON_WATCHER_ENABLED=true');
    }
  }
}
