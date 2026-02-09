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

    this.config = {
      nodeEnv: parsedEnv.NODE_ENV,
      port: parsedEnv.PORT,
      logLevel: parsedEnv.LOG_LEVEL,
      telegramEnabled: parsedEnv.TELEGRAM_ENABLED,
      chainWatcherEnabled: parsedEnv.CHAIN_WATCHER_ENABLED,
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
