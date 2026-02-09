import { Injectable } from '@nestjs/common';
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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TELEGRAM_ENABLED: booleanSchema.default(false),
  CHAIN_WATCHER_ENABLED: booleanSchema.default(false),
  CHAIN_RECEIPT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  CHAIN_RPC_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(350),
  CHAIN_BACKOFF_BASE_MS: z.coerce.number().int().positive().default(1000),
  CHAIN_BACKOFF_MAX_MS: z.coerce.number().int().positive().default(30000),
  CHAIN_BLOCK_QUEUE_MAX: z.coerce.number().int().positive().default(120),
  CHAIN_HEARTBEAT_INTERVAL_SEC: z.coerce.number().int().positive().default(60),
  BOT_TOKEN: z.string().trim().min(1).optional(),
  DATABASE_URL: z.url(),
  ETH_ALCHEMY_WSS_URL: z.url().optional(),
  ETH_INFURA_WSS_URL: z.url().optional(),
  UNISWAP_SWAP_ALLOWLIST: z.string().trim().optional(),
  ETHERSCAN_TX_BASE_URL: z.url().default('https://etherscan.io/tx/'),
});

type ParsedEnv = z.infer<typeof envSchema>;

@Injectable()
export class AppConfigService {
  private readonly config: AppConfig;

  public constructor() {
    const parsedEnv: ParsedEnv = envSchema.parse(process.env);
    this.assertWatcherConfig(parsedEnv);

    this.config = {
      nodeEnv: parsedEnv.NODE_ENV,
      port: parsedEnv.PORT,
      logLevel: parsedEnv.LOG_LEVEL,
      telegramEnabled: parsedEnv.TELEGRAM_ENABLED,
      chainWatcherEnabled: parsedEnv.CHAIN_WATCHER_ENABLED,
      chainReceiptConcurrency: parsedEnv.CHAIN_RECEIPT_CONCURRENCY,
      chainRpcMinIntervalMs: parsedEnv.CHAIN_RPC_MIN_INTERVAL_MS,
      chainBackoffBaseMs: parsedEnv.CHAIN_BACKOFF_BASE_MS,
      chainBackoffMaxMs: parsedEnv.CHAIN_BACKOFF_MAX_MS,
      chainBlockQueueMax: parsedEnv.CHAIN_BLOCK_QUEUE_MAX,
      chainHeartbeatIntervalSec: parsedEnv.CHAIN_HEARTBEAT_INTERVAL_SEC,
      botToken: parsedEnv.BOT_TOKEN ?? null,
      databaseUrl: parsedEnv.DATABASE_URL,
      ethAlchemyWssUrl: parsedEnv.ETH_ALCHEMY_WSS_URL ?? null,
      ethInfuraWssUrl: parsedEnv.ETH_INFURA_WSS_URL ?? null,
      uniswapSwapAllowlist: this.parseAllowlist(parsedEnv.UNISWAP_SWAP_ALLOWLIST),
      etherscanTxBaseUrl: parsedEnv.ETHERSCAN_TX_BASE_URL,
    };
  }

  public get nodeEnv(): AppConfig['nodeEnv'] {
    return this.config.nodeEnv;
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

  public get uniswapSwapAllowlist(): readonly string[] {
    return this.config.uniswapSwapAllowlist;
  }

  public get etherscanTxBaseUrl(): string {
    return this.config.etherscanTxBaseUrl;
  }

  private assertWatcherConfig(parsedEnv: ParsedEnv): void {
    if (parsedEnv.CHAIN_BACKOFF_MAX_MS < parsedEnv.CHAIN_BACKOFF_BASE_MS) {
      throw new Error('CHAIN_BACKOFF_MAX_MS must be >= CHAIN_BACKOFF_BASE_MS');
    }

    if (!parsedEnv.CHAIN_WATCHER_ENABLED) {
      return;
    }

    if (!parsedEnv.ETH_ALCHEMY_WSS_URL) {
      throw new Error('ETH_ALCHEMY_WSS_URL is required when CHAIN_WATCHER_ENABLED=true');
    }

    if (!parsedEnv.ETH_INFURA_WSS_URL) {
      throw new Error('ETH_INFURA_WSS_URL is required when CHAIN_WATCHER_ENABLED=true');
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
