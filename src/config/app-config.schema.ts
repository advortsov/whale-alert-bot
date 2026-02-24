import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const booleanSchema = z
  .union([z.boolean(), z.string()])
  .transform((value: string | boolean): boolean => {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalizedValue: string = value.trim().toLowerCase();

    return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
  });

const resolvePackageVersion = (): string => {
  try {
    const packageJsonPath: string = resolve(process.cwd(), 'package.json');
    const packageJsonRaw: string = readFileSync(packageJsonPath, 'utf8');
    const packageJsonParsed: unknown = JSON.parse(packageJsonRaw);

    if (
      typeof packageJsonParsed === 'object' &&
      packageJsonParsed !== null &&
      'version' in packageJsonParsed
    ) {
      const versionValue: unknown = packageJsonParsed.version;

      if (typeof versionValue === 'string' && versionValue.trim().length > 0) {
        return versionValue.trim();
      }
    }
  } catch {
    // Fallback is handled below.
  }

  return '0.0.0';
};

const DEFAULT_APP_VERSION: string = resolvePackageVersion();
const DEFAULT_PORT = 3000;
const DEFAULT_RPC_MIN_INTERVAL_MS = 350;
const DEFAULT_SOLANA_BACKOFF_BASE_MS = 5000;
const DEFAULT_BACKOFF_MAX_MS = 60_000;
const DEFAULT_BLOCK_QUEUE_MAX = 120;
const DEFAULT_CATCHUP_BATCH = 40;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_LAG_WARN = 50;
const DEFAULT_MAX_QUEUE_WARN = 80;
const DEFAULT_MAX_BACKOFF_WARN_MS = 10_000;
const DEFAULT_COINGECKO_TIMEOUT_MS = 8000;
const DEFAULT_PRICE_CACHE_FRESH_TTL_SEC = 120;
const DEFAULT_PRICE_CACHE_STALE_TTL_SEC = 600;
const DEFAULT_ALERT_MIN_SEND_INTERVAL_SEC = 10;
const DEFAULT_HISTORY_CACHE_TTL_SEC = 120;
const DEFAULT_HISTORY_RATE_LIMIT_PER_MINUTE = 12;
const DEFAULT_HISTORY_BUTTON_COOLDOWN_SEC = 3;
const DEFAULT_HISTORY_STALE_ON_ERROR_SEC = 600;
const DEFAULT_HISTORY_HOT_CACHE_TOP_WALLETS = 100;
const DEFAULT_HISTORY_HOT_CACHE_REFRESH_INTERVAL_SEC = 30;
const DEFAULT_HISTORY_HOT_CACHE_PAGE_LIMIT = 20;
const DEFAULT_HISTORY_HOT_CACHE_MAX_ITEMS_PER_WALLET = 200;
const DEFAULT_HISTORY_HOT_CACHE_TTL_SEC = 900;
const DEFAULT_HISTORY_HOT_CACHE_STALE_SEC = 1800;
const DEFAULT_RATE_LIMIT_ETHERSCAN_MIN_TIME_MS = 200;
const DEFAULT_RATE_LIMIT_ETHERSCAN_MAX_CONCURRENT = 1;
const DEFAULT_RATE_LIMIT_SOLANA_HELIUS_MIN_TIME_MS = 40;
const DEFAULT_RATE_LIMIT_SOLANA_HELIUS_MAX_CONCURRENT = 5;
const DEFAULT_RATE_LIMIT_SOLANA_PUBLIC_MIN_TIME_MS = 250;
const DEFAULT_RATE_LIMIT_SOLANA_PUBLIC_MAX_CONCURRENT = 1;
const DEFAULT_RATE_LIMIT_TRON_GRID_MIN_TIME_MS = 1000;
const DEFAULT_RATE_LIMIT_TRON_GRID_MAX_CONCURRENT = 1;
const DEFAULT_RATE_LIMIT_TRON_PUBLIC_MIN_TIME_MS = 1200;
const DEFAULT_RATE_LIMIT_TRON_PUBLIC_MAX_CONCURRENT = 1;
const DEFAULT_RATE_LIMIT_COINGECKO_MIN_TIME_MS = 2000;
const DEFAULT_RATE_LIMIT_COINGECKO_MAX_CONCURRENT = 1;
const DEFAULT_RATE_LIMIT_ETH_RPC_MIN_TIME_MS = 350;
const DEFAULT_RATE_LIMIT_ETH_RPC_MAX_CONCURRENT = 2;
const DEFAULT_JWT_ACCESS_TTL_SEC = 900;
const DEFAULT_JWT_REFRESH_TTL_SEC = 604_800;

const optionalNonEmptyStringSchema = z
  .string()
  .trim()
  .optional()
  .transform((value: string | undefined): string | undefined => {
    if (typeof value !== 'string') {
      return undefined;
    }

    return value.length > 0 ? value : undefined;
  });

export const envSchema = z.object({
  APP_VERSION: z.string().trim().min(1).default(DEFAULT_APP_VERSION),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TELEGRAM_ENABLED: booleanSchema.default(false),
  TMA_ENABLED: booleanSchema.default(false),
  CHAIN_WATCHER_ENABLED: booleanSchema.default(false),
  SOLANA_WATCHER_ENABLED: booleanSchema.default(false),
  TRON_WATCHER_ENABLED: booleanSchema.default(false),
  CHAIN_RECEIPT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  CHAIN_RPC_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(DEFAULT_RPC_MIN_INTERVAL_MS),
  CHAIN_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(1000),
  CHAIN_SOLANA_BACKOFF_BASE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_SOLANA_BACKOFF_BASE_MS),
  CHAIN_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(DEFAULT_BACKOFF_MAX_MS),
  CHAIN_BLOCK_QUEUE_MAX: z.coerce.number().int().positive().default(DEFAULT_BLOCK_QUEUE_MAX),
  CHAIN_SOLANA_QUEUE_MAX: z.coerce.number().int().positive().default(DEFAULT_BLOCK_QUEUE_MAX),
  CHAIN_TRON_QUEUE_MAX: z.coerce.number().int().positive().default(DEFAULT_BLOCK_QUEUE_MAX),
  CHAIN_SOLANA_CATCHUP_BATCH: z.coerce.number().int().positive().default(DEFAULT_CATCHUP_BATCH),
  CHAIN_TRON_CATCHUP_BATCH: z.coerce.number().int().positive().default(DEFAULT_CATCHUP_BATCH),
  CHAIN_SOLANA_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_POLL_INTERVAL_MS),
  CHAIN_TRON_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(DEFAULT_POLL_INTERVAL_MS),
  CHAIN_HEARTBEAT_INTERVAL_SEC: z.coerce.number().int().positive().default(60),
  CHAIN_REORG_CONFIRMATIONS: z.coerce.number().int().min(0).default(2),
  CHAIN_MAX_LAG_WARN: z.coerce.number().int().min(0).default(DEFAULT_MAX_LAG_WARN),
  CHAIN_MAX_QUEUE_WARN: z.coerce.number().int().min(0).default(DEFAULT_MAX_QUEUE_WARN),
  CHAIN_MAX_BACKOFF_WARN_MS: z.coerce.number().int().min(0).default(DEFAULT_MAX_BACKOFF_WARN_MS),
  BOT_TOKEN: optionalNonEmptyStringSchema,
  TMA_BASE_URL: optionalNonEmptyStringSchema,
  TMA_BOT_USERNAME: optionalNonEmptyStringSchema,
  TMA_ALLOWED_ORIGINS: optionalNonEmptyStringSchema,
  DATABASE_URL: z.url(),
  ETH_ALCHEMY_WSS_URL: z.url().optional(),
  ETH_INFURA_WSS_URL: z.url().optional(),
  SOLANA_HELIUS_HTTP_URL: z.url().optional(),
  SOLANA_HELIUS_WSS_URL: z.url().optional(),
  SOLANA_PUBLIC_HTTP_URL: z.url().optional(),
  SOLANA_PUBLIC_WSS_URL: z.url().optional(),
  TRON_PRIMARY_HTTP_URL: z.url().optional(),
  TRON_FALLBACK_HTTP_URL: z.url().optional(),
  UNISWAP_SWAP_ALLOWLIST: z.string().trim().optional(),
  ETH_CEX_ADDRESS_ALLOWLIST: z.string().trim().optional(),
  ETHERSCAN_TX_BASE_URL: z.url().default('https://etherscan.io/tx/'),
  ETHERSCAN_API_BASE_URL: z.url().default('https://api.etherscan.io/v2/api'),
  ETHERSCAN_API_KEY: optionalNonEmptyStringSchema,
  TRON_GRID_API_BASE_URL: z.url().default('https://api.trongrid.io'),
  TRON_GRID_API_KEY: optionalNonEmptyStringSchema,
  TRONSCAN_TX_BASE_URL: z.url().default('https://tronscan.org/#/transaction/'),
  COINGECKO_API_BASE_URL: z.url().default('https://api.coingecko.com/api/v3'),
  COINGECKO_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_COINGECKO_TIMEOUT_MS),
  PRICE_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(1000),
  PRICE_CACHE_FRESH_TTL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_PRICE_CACHE_FRESH_TTL_SEC),
  PRICE_CACHE_STALE_TTL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_PRICE_CACHE_STALE_TTL_SEC),
  ALERT_MIN_SEND_INTERVAL_SEC: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_ALERT_MIN_SEND_INTERVAL_SEC),
  TOKEN_META_CACHE_TTL_SEC: z.coerce.number().int().positive().default(3600),
  HISTORY_CACHE_TTL_SEC: z.coerce.number().int().positive().default(DEFAULT_HISTORY_CACHE_TTL_SEC),
  HISTORY_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HISTORY_RATE_LIMIT_PER_MINUTE),
  HISTORY_BUTTON_COOLDOWN_SEC: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_HISTORY_BUTTON_COOLDOWN_SEC),
  HISTORY_STALE_ON_ERROR_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HISTORY_STALE_ON_ERROR_SEC),
  HISTORY_HOT_CACHE_ENABLED: booleanSchema.default(true),
  HISTORY_HOT_CACHE_TOP_WALLETS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HISTORY_HOT_CACHE_TOP_WALLETS),
  HISTORY_HOT_CACHE_REFRESH_INTERVAL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HISTORY_HOT_CACHE_REFRESH_INTERVAL_SEC),
  HISTORY_HOT_CACHE_PAGE_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HISTORY_HOT_CACHE_PAGE_LIMIT),
  HISTORY_HOT_CACHE_MAX_ITEMS_PER_WALLET: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HISTORY_HOT_CACHE_MAX_ITEMS_PER_WALLET),
  HISTORY_HOT_CACHE_TTL_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HISTORY_HOT_CACHE_TTL_SEC),
  HISTORY_HOT_CACHE_STALE_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_HISTORY_HOT_CACHE_STALE_SEC),
  METRICS_ENABLED: booleanSchema.default(true),
  RATE_LIMIT_ETHERSCAN_MIN_TIME_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_RATE_LIMIT_ETHERSCAN_MIN_TIME_MS),
  RATE_LIMIT_ETHERSCAN_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_ETHERSCAN_MAX_CONCURRENT),
  RATE_LIMIT_SOLANA_HELIUS_MIN_TIME_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_RATE_LIMIT_SOLANA_HELIUS_MIN_TIME_MS),
  RATE_LIMIT_SOLANA_HELIUS_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_SOLANA_HELIUS_MAX_CONCURRENT),
  RATE_LIMIT_SOLANA_PUBLIC_MIN_TIME_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_RATE_LIMIT_SOLANA_PUBLIC_MIN_TIME_MS),
  RATE_LIMIT_SOLANA_PUBLIC_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_SOLANA_PUBLIC_MAX_CONCURRENT),
  RATE_LIMIT_TRON_GRID_MIN_TIME_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_RATE_LIMIT_TRON_GRID_MIN_TIME_MS),
  RATE_LIMIT_TRON_GRID_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_TRON_GRID_MAX_CONCURRENT),
  RATE_LIMIT_TRON_PUBLIC_MIN_TIME_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_RATE_LIMIT_TRON_PUBLIC_MIN_TIME_MS),
  RATE_LIMIT_TRON_PUBLIC_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_TRON_PUBLIC_MAX_CONCURRENT),
  RATE_LIMIT_COINGECKO_MIN_TIME_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_RATE_LIMIT_COINGECKO_MIN_TIME_MS),
  RATE_LIMIT_COINGECKO_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_COINGECKO_MAX_CONCURRENT),
  RATE_LIMIT_ETH_RPC_MIN_TIME_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_RATE_LIMIT_ETH_RPC_MIN_TIME_MS),
  RATE_LIMIT_ETH_RPC_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_ETH_RPC_MAX_CONCURRENT),
  JWT_SECRET: optionalNonEmptyStringSchema,
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(DEFAULT_JWT_ACCESS_TTL_SEC),
  JWT_REFRESH_TTL_SEC: z.coerce.number().int().positive().default(DEFAULT_JWT_REFRESH_TTL_SEC),
});

export type ParsedEnv = z.infer<typeof envSchema>;
