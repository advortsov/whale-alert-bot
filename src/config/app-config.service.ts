import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

import type { AppConfig } from './app-config.types';

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

const envSchema = z.object({
  APP_VERSION: z.string().trim().min(1).default(DEFAULT_APP_VERSION),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TELEGRAM_ENABLED: booleanSchema.default(false),
  CHAIN_WATCHER_ENABLED: booleanSchema.default(false),
  SOLANA_WATCHER_ENABLED: booleanSchema.default(false),
  CHAIN_RECEIPT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  CHAIN_RPC_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(350),
  CHAIN_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(1000),
  CHAIN_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(30000),
  CHAIN_BLOCK_QUEUE_MAX: z.coerce.number().int().positive().default(120),
  CHAIN_HEARTBEAT_INTERVAL_SEC: z.coerce.number().int().positive().default(60),
  CHAIN_REORG_CONFIRMATIONS: z.coerce.number().int().min(0).default(2),
  BOT_TOKEN: z.string().trim().min(1).optional(),
  DATABASE_URL: z.url(),
  ETH_ALCHEMY_WSS_URL: z.url().optional(),
  ETH_INFURA_WSS_URL: z.url().optional(),
  SOLANA_HELIUS_HTTP_URL: z.url().optional(),
  SOLANA_HELIUS_WSS_URL: z.url().optional(),
  SOLANA_PUBLIC_HTTP_URL: z.url().optional(),
  SOLANA_PUBLIC_WSS_URL: z.url().optional(),
  UNISWAP_SWAP_ALLOWLIST: z.string().trim().optional(),
  ETH_CEX_ADDRESS_ALLOWLIST: z.string().trim().optional(),
  ETHERSCAN_TX_BASE_URL: z.url().default('https://etherscan.io/tx/'),
  ETHERSCAN_API_BASE_URL: z.url().default('https://api.etherscan.io/v2/api'),
  ETHERSCAN_API_KEY: z.string().trim().min(1).optional(),
  COINGECKO_API_BASE_URL: z.url().default('https://api.coingecko.com/api/v3'),
  COINGECKO_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  PRICE_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(1000),
  PRICE_CACHE_FRESH_TTL_SEC: z.coerce.number().int().positive().default(120),
  PRICE_CACHE_STALE_TTL_SEC: z.coerce.number().int().positive().default(600),
  ALERT_MIN_SEND_INTERVAL_SEC: z.coerce.number().int().min(0).default(10),
  TOKEN_META_CACHE_TTL_SEC: z.coerce.number().int().positive().default(3600),
  HISTORY_CACHE_TTL_SEC: z.coerce.number().int().positive().default(120),
  HISTORY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(12),
  HISTORY_BUTTON_COOLDOWN_SEC: z.coerce.number().int().min(0).default(3),
  HISTORY_STALE_ON_ERROR_SEC: z.coerce.number().int().positive().default(600),
});

type ParsedEnv = z.infer<typeof envSchema>;

@Injectable()
export class AppConfigService {
  private readonly config: AppConfig;

  public constructor() {
    const parsedEnv: ParsedEnv = envSchema.parse(process.env);
    this.assertWatcherConfig(parsedEnv);

    this.config = {
      appVersion: parsedEnv.APP_VERSION,
      nodeEnv: parsedEnv.NODE_ENV,
      port: parsedEnv.PORT,
      logLevel: parsedEnv.LOG_LEVEL,
      telegramEnabled: parsedEnv.TELEGRAM_ENABLED,
      chainWatcherEnabled: parsedEnv.CHAIN_WATCHER_ENABLED,
      solanaWatcherEnabled: parsedEnv.SOLANA_WATCHER_ENABLED,
      chainReceiptConcurrency: parsedEnv.CHAIN_RECEIPT_CONCURRENCY,
      chainRpcMinIntervalMs: parsedEnv.CHAIN_RPC_MIN_INTERVAL_MS,
      chainBackoffBaseMs: parsedEnv.CHAIN_BACKOFF_BASE_MS,
      chainBackoffMaxMs: parsedEnv.CHAIN_BACKOFF_MAX_MS,
      chainBlockQueueMax: parsedEnv.CHAIN_BLOCK_QUEUE_MAX,
      chainHeartbeatIntervalSec: parsedEnv.CHAIN_HEARTBEAT_INTERVAL_SEC,
      chainReorgConfirmations: parsedEnv.CHAIN_REORG_CONFIRMATIONS,
      botToken: parsedEnv.BOT_TOKEN ?? null,
      databaseUrl: parsedEnv.DATABASE_URL,
      ethAlchemyWssUrl: parsedEnv.ETH_ALCHEMY_WSS_URL ?? null,
      ethInfuraWssUrl: parsedEnv.ETH_INFURA_WSS_URL ?? null,
      solanaHeliusHttpUrl: parsedEnv.SOLANA_HELIUS_HTTP_URL ?? null,
      solanaHeliusWssUrl: parsedEnv.SOLANA_HELIUS_WSS_URL ?? null,
      solanaPublicHttpUrl: parsedEnv.SOLANA_PUBLIC_HTTP_URL ?? null,
      solanaPublicWssUrl: parsedEnv.SOLANA_PUBLIC_WSS_URL ?? null,
      uniswapSwapAllowlist: this.parseAllowlist(parsedEnv.UNISWAP_SWAP_ALLOWLIST),
      ethCexAddressAllowlist: this.parseAllowlist(parsedEnv.ETH_CEX_ADDRESS_ALLOWLIST),
      etherscanTxBaseUrl: parsedEnv.ETHERSCAN_TX_BASE_URL,
      etherscanApiBaseUrl: parsedEnv.ETHERSCAN_API_BASE_URL,
      etherscanApiKey: parsedEnv.ETHERSCAN_API_KEY ?? null,
      coingeckoApiBaseUrl: parsedEnv.COINGECKO_API_BASE_URL,
      coingeckoTimeoutMs: parsedEnv.COINGECKO_TIMEOUT_MS,
      priceCacheMaxEntries: parsedEnv.PRICE_CACHE_MAX_ENTRIES,
      priceCacheFreshTtlSec: parsedEnv.PRICE_CACHE_FRESH_TTL_SEC,
      priceCacheStaleTtlSec: parsedEnv.PRICE_CACHE_STALE_TTL_SEC,
      alertMinSendIntervalSec: parsedEnv.ALERT_MIN_SEND_INTERVAL_SEC,
      tokenMetaCacheTtlSec: parsedEnv.TOKEN_META_CACHE_TTL_SEC,
      historyCacheTtlSec: parsedEnv.HISTORY_CACHE_TTL_SEC,
      historyRateLimitPerMinute: parsedEnv.HISTORY_RATE_LIMIT_PER_MINUTE,
      historyButtonCooldownSec: parsedEnv.HISTORY_BUTTON_COOLDOWN_SEC,
      historyStaleOnErrorSec: parsedEnv.HISTORY_STALE_ON_ERROR_SEC,
    };
  }

  public get nodeEnv(): AppConfig['nodeEnv'] {
    return this.config.nodeEnv;
  }

  public get appVersion(): string {
    return this.config.appVersion;
  }

  public get port(): number {
    return this.config.port;
  }

  public get logLevel(): AppConfig['logLevel'] {
    return this.config.logLevel;
  }

  public get telegramEnabled(): boolean {
    return this.config.telegramEnabled;
  }

  public get chainWatcherEnabled(): boolean {
    return this.config.chainWatcherEnabled;
  }

  public get solanaWatcherEnabled(): boolean {
    return this.config.solanaWatcherEnabled;
  }

  public get chainReceiptConcurrency(): number {
    return this.config.chainReceiptConcurrency;
  }

  public get chainRpcMinIntervalMs(): number {
    return this.config.chainRpcMinIntervalMs;
  }

  public get chainBackoffBaseMs(): number {
    return this.config.chainBackoffBaseMs;
  }

  public get chainBackoffMaxMs(): number {
    return this.config.chainBackoffMaxMs;
  }

  public get chainBlockQueueMax(): number {
    return this.config.chainBlockQueueMax;
  }

  public get chainHeartbeatIntervalSec(): number {
    return this.config.chainHeartbeatIntervalSec;
  }

  public get chainReorgConfirmations(): number {
    return this.config.chainReorgConfirmations;
  }

  public get botToken(): string | null {
    return this.config.botToken;
  }

  public get databaseUrl(): string {
    return this.config.databaseUrl;
  }

  public get ethAlchemyWssUrl(): string | null {
    return this.config.ethAlchemyWssUrl;
  }

  public get ethInfuraWssUrl(): string | null {
    return this.config.ethInfuraWssUrl;
  }

  public get solanaHeliusHttpUrl(): string | null {
    return this.config.solanaHeliusHttpUrl;
  }

  public get solanaHeliusWssUrl(): string | null {
    return this.config.solanaHeliusWssUrl;
  }

  public get solanaPublicHttpUrl(): string | null {
    return this.config.solanaPublicHttpUrl;
  }

  public get solanaPublicWssUrl(): string | null {
    return this.config.solanaPublicWssUrl;
  }

  public get uniswapSwapAllowlist(): readonly string[] {
    return this.config.uniswapSwapAllowlist;
  }

  public get ethCexAddressAllowlist(): readonly string[] {
    return this.config.ethCexAddressAllowlist;
  }

  public get etherscanTxBaseUrl(): string {
    return this.config.etherscanTxBaseUrl;
  }

  public get etherscanApiBaseUrl(): string {
    return this.config.etherscanApiBaseUrl;
  }

  public get etherscanApiKey(): string | null {
    return this.config.etherscanApiKey;
  }

  public get coingeckoApiBaseUrl(): string {
    return this.config.coingeckoApiBaseUrl;
  }

  public get coingeckoTimeoutMs(): number {
    return this.config.coingeckoTimeoutMs;
  }

  public get priceCacheMaxEntries(): number {
    return this.config.priceCacheMaxEntries;
  }

  public get priceCacheFreshTtlSec(): number {
    return this.config.priceCacheFreshTtlSec;
  }

  public get priceCacheStaleTtlSec(): number {
    return this.config.priceCacheStaleTtlSec;
  }

  public get alertMinSendIntervalSec(): number {
    return this.config.alertMinSendIntervalSec;
  }

  public get tokenMetaCacheTtlSec(): number {
    return this.config.tokenMetaCacheTtlSec;
  }

  public get historyCacheTtlSec(): number {
    return this.config.historyCacheTtlSec;
  }

  public get historyRateLimitPerMinute(): number {
    return this.config.historyRateLimitPerMinute;
  }

  public get historyButtonCooldownSec(): number {
    return this.config.historyButtonCooldownSec;
  }

  public get historyStaleOnErrorSec(): number {
    return this.config.historyStaleOnErrorSec;
  }

  private assertWatcherConfig(parsedEnv: ParsedEnv): void {
    if (parsedEnv.CHAIN_BACKOFF_MAX_MS < parsedEnv.CHAIN_BACKOFF_BASE_MS) {
      throw new Error('CHAIN_BACKOFF_MAX_MS must be >= CHAIN_BACKOFF_BASE_MS');
    }

    if (parsedEnv.PRICE_CACHE_STALE_TTL_SEC < parsedEnv.PRICE_CACHE_FRESH_TTL_SEC) {
      throw new Error('PRICE_CACHE_STALE_TTL_SEC must be >= PRICE_CACHE_FRESH_TTL_SEC');
    }

    if (parsedEnv.CHAIN_WATCHER_ENABLED) {
      if (!parsedEnv.ETH_ALCHEMY_WSS_URL) {
        throw new Error('ETH_ALCHEMY_WSS_URL is required when CHAIN_WATCHER_ENABLED=true');
      }

      if (!parsedEnv.ETH_INFURA_WSS_URL) {
        throw new Error('ETH_INFURA_WSS_URL is required when CHAIN_WATCHER_ENABLED=true');
      }
    }

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

  private parseAllowlist(rawValue: string | undefined): readonly string[] {
    if (!rawValue) {
      return [];
    }

    return rawValue
      .split(',')
      .map((value: string): string => value.trim().toLowerCase())
      .filter((value: string): boolean => value.length > 0);
  }
}
