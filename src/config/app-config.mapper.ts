import type { ParsedEnv } from './app-config.schema';
import type { AppConfig } from './app-config.types';

export const mapAppConfig = (parsedEnv: ParsedEnv): AppConfig => ({
  ...mapCoreConfig(parsedEnv),
  ...mapWatcherConfig(parsedEnv),
  ...mapApiConfig(parsedEnv),
  ...mapHistoryConfig(parsedEnv),
  ...mapRateLimitConfig(parsedEnv),
});

const mapCoreConfig = (
  parsedEnv: ParsedEnv,
): Pick<
  AppConfig,
  | 'appVersion'
  | 'nodeEnv'
  | 'port'
  | 'logLevel'
  | 'telegramEnabled'
  | 'tmaEnabled'
  | 'databaseUrl'
  | 'botToken'
  | 'tmaBaseUrl'
  | 'tmaBotUsername'
  | 'tmaAllowedOrigins'
> => ({
  appVersion: parsedEnv.APP_VERSION,
  nodeEnv: parsedEnv.NODE_ENV,
  port: parsedEnv.PORT,
  logLevel: parsedEnv.LOG_LEVEL,
  telegramEnabled: parsedEnv.TELEGRAM_ENABLED,
  tmaEnabled: parsedEnv.TMA_ENABLED,
  databaseUrl: parsedEnv.DATABASE_URL,
  botToken: parsedEnv.BOT_TOKEN ?? null,
  tmaBaseUrl: parsedEnv.TMA_BASE_URL ?? null,
  tmaBotUsername: parsedEnv.TMA_BOT_USERNAME ?? null,
  tmaAllowedOrigins: parseCsvList(parsedEnv.TMA_ALLOWED_ORIGINS),
});

const mapWatcherConfig = (
  parsedEnv: ParsedEnv,
): Pick<
  AppConfig,
  | 'chainWatcherEnabled'
  | 'solanaWatcherEnabled'
  | 'tronWatcherEnabled'
  | 'chainReceiptConcurrency'
  | 'chainRpcMinIntervalMs'
  | 'chainBackoffBaseMs'
  | 'chainSolanaBackoffBaseMs'
  | 'chainBackoffMaxMs'
  | 'chainBlockQueueMax'
  | 'chainSolanaQueueMax'
  | 'chainTronQueueMax'
  | 'chainSolanaCatchupBatch'
  | 'chainTronCatchupBatch'
  | 'chainSolanaPollIntervalMs'
  | 'chainTronPollIntervalMs'
  | 'chainHeartbeatIntervalSec'
  | 'chainReorgConfirmations'
  | 'chainMaxLagWarn'
  | 'chainMaxQueueWarn'
  | 'chainMaxBackoffWarnMs'
  | 'ethAlchemyWssUrl'
  | 'ethInfuraWssUrl'
  | 'solanaHeliusHttpUrl'
  | 'solanaHeliusWssUrl'
  | 'solanaPublicHttpUrl'
  | 'solanaPublicWssUrl'
  | 'tronPrimaryHttpUrl'
  | 'tronFallbackHttpUrl'
> => ({
  chainWatcherEnabled: parsedEnv.CHAIN_WATCHER_ENABLED,
  solanaWatcherEnabled: parsedEnv.SOLANA_WATCHER_ENABLED,
  tronWatcherEnabled: parsedEnv.TRON_WATCHER_ENABLED,
  chainReceiptConcurrency: parsedEnv.CHAIN_RECEIPT_CONCURRENCY,
  chainRpcMinIntervalMs: parsedEnv.CHAIN_RPC_MIN_INTERVAL_MS,
  chainBackoffBaseMs: parsedEnv.CHAIN_BACKOFF_BASE_MS,
  chainSolanaBackoffBaseMs: parsedEnv.CHAIN_SOLANA_BACKOFF_BASE_MS,
  chainBackoffMaxMs: parsedEnv.CHAIN_BACKOFF_MAX_MS,
  chainBlockQueueMax: parsedEnv.CHAIN_BLOCK_QUEUE_MAX,
  chainSolanaQueueMax: parsedEnv.CHAIN_SOLANA_QUEUE_MAX,
  chainTronQueueMax: parsedEnv.CHAIN_TRON_QUEUE_MAX,
  chainSolanaCatchupBatch: parsedEnv.CHAIN_SOLANA_CATCHUP_BATCH,
  chainTronCatchupBatch: parsedEnv.CHAIN_TRON_CATCHUP_BATCH,
  chainSolanaPollIntervalMs: parsedEnv.CHAIN_SOLANA_POLL_INTERVAL_MS,
  chainTronPollIntervalMs: parsedEnv.CHAIN_TRON_POLL_INTERVAL_MS,
  chainHeartbeatIntervalSec: parsedEnv.CHAIN_HEARTBEAT_INTERVAL_SEC,
  chainReorgConfirmations: parsedEnv.CHAIN_REORG_CONFIRMATIONS,
  chainMaxLagWarn: parsedEnv.CHAIN_MAX_LAG_WARN,
  chainMaxQueueWarn: parsedEnv.CHAIN_MAX_QUEUE_WARN,
  chainMaxBackoffWarnMs: parsedEnv.CHAIN_MAX_BACKOFF_WARN_MS,
  ethAlchemyWssUrl: parsedEnv.ETH_ALCHEMY_WSS_URL ?? null,
  ethInfuraWssUrl: parsedEnv.ETH_INFURA_WSS_URL ?? null,
  solanaHeliusHttpUrl: parsedEnv.SOLANA_HELIUS_HTTP_URL ?? null,
  solanaHeliusWssUrl: parsedEnv.SOLANA_HELIUS_WSS_URL ?? null,
  solanaPublicHttpUrl: parsedEnv.SOLANA_PUBLIC_HTTP_URL ?? null,
  solanaPublicWssUrl: parsedEnv.SOLANA_PUBLIC_WSS_URL ?? null,
  tronPrimaryHttpUrl: parsedEnv.TRON_PRIMARY_HTTP_URL ?? null,
  tronFallbackHttpUrl: parsedEnv.TRON_FALLBACK_HTTP_URL ?? null,
});

const mapApiConfig = (
  parsedEnv: ParsedEnv,
): Pick<
  AppConfig,
  | 'uniswapSwapAllowlist'
  | 'ethCexAddressAllowlist'
  | 'etherscanTxBaseUrl'
  | 'etherscanApiBaseUrl'
  | 'etherscanApiKey'
  | 'tronGridApiBaseUrl'
  | 'tronGridApiKey'
  | 'tronscanTxBaseUrl'
  | 'coingeckoApiBaseUrl'
  | 'coingeckoTimeoutMs'
  | 'priceCacheMaxEntries'
  | 'priceCacheFreshTtlSec'
  | 'priceCacheStaleTtlSec'
  | 'priceHistoryCacheMaxEntries'
  | 'priceHistoryCacheTtlSec'
  | 'priceHistoryCacheStaleSec'
  | 'priceHistoryRangeMaxAgeDays'
  | 'alertMinSendIntervalSec'
  | 'tokenMetaCacheTtlSec'
> => ({
  uniswapSwapAllowlist: parseAllowlist(parsedEnv.UNISWAP_SWAP_ALLOWLIST),
  ethCexAddressAllowlist: parseAllowlist(parsedEnv.ETH_CEX_ADDRESS_ALLOWLIST),
  etherscanTxBaseUrl: parsedEnv.ETHERSCAN_TX_BASE_URL,
  etherscanApiBaseUrl: parsedEnv.ETHERSCAN_API_BASE_URL,
  etherscanApiKey: parsedEnv.ETHERSCAN_API_KEY ?? null,
  tronGridApiBaseUrl: parsedEnv.TRON_GRID_API_BASE_URL,
  tronGridApiKey: parsedEnv.TRON_GRID_API_KEY ?? null,
  tronscanTxBaseUrl: parsedEnv.TRONSCAN_TX_BASE_URL,
  coingeckoApiBaseUrl: parsedEnv.COINGECKO_API_BASE_URL,
  coingeckoTimeoutMs: parsedEnv.COINGECKO_TIMEOUT_MS,
  priceCacheMaxEntries: parsedEnv.PRICE_CACHE_MAX_ENTRIES,
  priceCacheFreshTtlSec: parsedEnv.PRICE_CACHE_FRESH_TTL_SEC,
  priceCacheStaleTtlSec: parsedEnv.PRICE_CACHE_STALE_TTL_SEC,
  priceHistoryCacheMaxEntries: parsedEnv.PRICE_HISTORY_CACHE_MAX_ENTRIES,
  priceHistoryCacheTtlSec: parsedEnv.PRICE_HISTORY_CACHE_TTL_SEC,
  priceHistoryCacheStaleSec: parsedEnv.PRICE_HISTORY_CACHE_STALE_SEC,
  priceHistoryRangeMaxAgeDays: parsedEnv.PRICE_HISTORY_RANGE_MAX_AGE_DAYS,
  alertMinSendIntervalSec: parsedEnv.ALERT_MIN_SEND_INTERVAL_SEC,
  tokenMetaCacheTtlSec: parsedEnv.TOKEN_META_CACHE_TTL_SEC,
});

const mapHistoryConfig = (
  parsedEnv: ParsedEnv,
): Pick<
  AppConfig,
  | 'historyCacheTtlSec'
  | 'historyRateLimitPerMinute'
  | 'historyButtonCooldownSec'
  | 'historyStaleOnErrorSec'
  | 'historyHotCacheEnabled'
  | 'historyHotCacheTopWallets'
  | 'historyHotCacheRefreshIntervalSec'
  | 'historyHotCachePageLimit'
  | 'historyHotCacheMaxItemsPerWallet'
  | 'historyHotCacheTtlSec'
  | 'historyHotCacheStaleSec'
> => ({
  historyCacheTtlSec: parsedEnv.HISTORY_CACHE_TTL_SEC,
  historyRateLimitPerMinute: parsedEnv.HISTORY_RATE_LIMIT_PER_MINUTE,
  historyButtonCooldownSec: parsedEnv.HISTORY_BUTTON_COOLDOWN_SEC,
  historyStaleOnErrorSec: parsedEnv.HISTORY_STALE_ON_ERROR_SEC,
  historyHotCacheEnabled: parsedEnv.HISTORY_HOT_CACHE_ENABLED,
  historyHotCacheTopWallets: parsedEnv.HISTORY_HOT_CACHE_TOP_WALLETS,
  historyHotCacheRefreshIntervalSec: parsedEnv.HISTORY_HOT_CACHE_REFRESH_INTERVAL_SEC,
  historyHotCachePageLimit: parsedEnv.HISTORY_HOT_CACHE_PAGE_LIMIT,
  historyHotCacheMaxItemsPerWallet: parsedEnv.HISTORY_HOT_CACHE_MAX_ITEMS_PER_WALLET,
  historyHotCacheTtlSec: parsedEnv.HISTORY_HOT_CACHE_TTL_SEC,
  historyHotCacheStaleSec: parsedEnv.HISTORY_HOT_CACHE_STALE_SEC,
});

const mapRateLimitConfig = (
  parsedEnv: ParsedEnv,
): Pick<
  AppConfig,
  | 'metricsEnabled'
  | 'rateLimitEtherscanMinTimeMs'
  | 'rateLimitEtherscanMaxConcurrent'
  | 'rateLimitSolanaHeliusMinTimeMs'
  | 'rateLimitSolanaHeliusMaxConcurrent'
  | 'rateLimitSolanaPublicMinTimeMs'
  | 'rateLimitSolanaPublicMaxConcurrent'
  | 'rateLimitTronGridMinTimeMs'
  | 'rateLimitTronGridMaxConcurrent'
  | 'rateLimitTronPublicMinTimeMs'
  | 'rateLimitTronPublicMaxConcurrent'
  | 'rateLimitCoingeckoMinTimeMs'
  | 'rateLimitCoingeckoMaxConcurrent'
  | 'rateLimitCoingeckoHistoryMinTimeMs'
  | 'rateLimitCoingeckoHistoryMaxConcurrent'
  | 'rateLimitEthRpcMinTimeMs'
  | 'rateLimitEthRpcMaxConcurrent'
  | 'jwtSecret'
  | 'jwtAccessTtlSec'
  | 'jwtRefreshTtlSec'
> => ({
  metricsEnabled: parsedEnv.METRICS_ENABLED,
  rateLimitEtherscanMinTimeMs: parsedEnv.RATE_LIMIT_ETHERSCAN_MIN_TIME_MS,
  rateLimitEtherscanMaxConcurrent: parsedEnv.RATE_LIMIT_ETHERSCAN_MAX_CONCURRENT,
  rateLimitSolanaHeliusMinTimeMs: parsedEnv.RATE_LIMIT_SOLANA_HELIUS_MIN_TIME_MS,
  rateLimitSolanaHeliusMaxConcurrent: parsedEnv.RATE_LIMIT_SOLANA_HELIUS_MAX_CONCURRENT,
  rateLimitSolanaPublicMinTimeMs: parsedEnv.RATE_LIMIT_SOLANA_PUBLIC_MIN_TIME_MS,
  rateLimitSolanaPublicMaxConcurrent: parsedEnv.RATE_LIMIT_SOLANA_PUBLIC_MAX_CONCURRENT,
  rateLimitTronGridMinTimeMs: parsedEnv.RATE_LIMIT_TRON_GRID_MIN_TIME_MS,
  rateLimitTronGridMaxConcurrent: parsedEnv.RATE_LIMIT_TRON_GRID_MAX_CONCURRENT,
  rateLimitTronPublicMinTimeMs: parsedEnv.RATE_LIMIT_TRON_PUBLIC_MIN_TIME_MS,
  rateLimitTronPublicMaxConcurrent: parsedEnv.RATE_LIMIT_TRON_PUBLIC_MAX_CONCURRENT,
  rateLimitCoingeckoMinTimeMs: parsedEnv.RATE_LIMIT_COINGECKO_MIN_TIME_MS,
  rateLimitCoingeckoMaxConcurrent: parsedEnv.RATE_LIMIT_COINGECKO_MAX_CONCURRENT,
  rateLimitCoingeckoHistoryMinTimeMs: parsedEnv.RATE_LIMIT_COINGECKO_HISTORY_MIN_TIME_MS,
  rateLimitCoingeckoHistoryMaxConcurrent: parsedEnv.RATE_LIMIT_COINGECKO_HISTORY_MAX_CONCURRENT,
  rateLimitEthRpcMinTimeMs: parsedEnv.RATE_LIMIT_ETH_RPC_MIN_TIME_MS,
  rateLimitEthRpcMaxConcurrent: parsedEnv.RATE_LIMIT_ETH_RPC_MAX_CONCURRENT,
  jwtSecret: parsedEnv.JWT_SECRET ?? null,
  jwtAccessTtlSec: parsedEnv.JWT_ACCESS_TTL_SEC,
  jwtRefreshTtlSec: parsedEnv.JWT_REFRESH_TTL_SEC,
});

const parseAllowlist = (rawValue: string | undefined): readonly string[] => {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value: string): string => value.trim().toLowerCase())
    .filter((value: string): boolean => value.length > 0);
};

const parseCsvList = (rawValue: string | undefined): readonly string[] => {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value: string): string => value.trim())
    .filter((value: string): boolean => value.length > 0);
};
