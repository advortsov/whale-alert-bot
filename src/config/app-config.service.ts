import { Injectable } from '@nestjs/common';

import { type ParsedEnv, envSchema } from './app-config.schema';
import type { AppConfig } from './app-config.types';
import { assertWatcherConfig } from './app-config.validators';

@Injectable()
export class AppConfigService {
  private readonly config: AppConfig;

  public constructor() {
    const parsedEnv: ParsedEnv = envSchema.parse(process.env);
    assertWatcherConfig(parsedEnv);
    this.config = this.mapConfig(parsedEnv);
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

  public get tronWatcherEnabled(): boolean {
    return this.config.tronWatcherEnabled;
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

  public get chainSolanaBackoffBaseMs(): number {
    return this.config.chainSolanaBackoffBaseMs;
  }

  public get chainBackoffMaxMs(): number {
    return this.config.chainBackoffMaxMs;
  }

  public get chainBlockQueueMax(): number {
    return this.config.chainBlockQueueMax;
  }

  public get chainSolanaQueueMax(): number {
    return this.config.chainSolanaQueueMax;
  }

  public get chainTronQueueMax(): number {
    return this.config.chainTronQueueMax;
  }

  public get chainSolanaCatchupBatch(): number {
    return this.config.chainSolanaCatchupBatch;
  }

  public get chainTronCatchupBatch(): number {
    return this.config.chainTronCatchupBatch;
  }

  public get chainSolanaPollIntervalMs(): number {
    return this.config.chainSolanaPollIntervalMs;
  }

  public get chainTronPollIntervalMs(): number {
    return this.config.chainTronPollIntervalMs;
  }

  public get chainHeartbeatIntervalSec(): number {
    return this.config.chainHeartbeatIntervalSec;
  }

  public get chainReorgConfirmations(): number {
    return this.config.chainReorgConfirmations;
  }

  public get chainMaxLagWarn(): number {
    return this.config.chainMaxLagWarn;
  }

  public get chainMaxQueueWarn(): number {
    return this.config.chainMaxQueueWarn;
  }

  public get chainMaxBackoffWarnMs(): number {
    return this.config.chainMaxBackoffWarnMs;
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

  public get tronPrimaryHttpUrl(): string | null {
    return this.config.tronPrimaryHttpUrl;
  }

  public get tronFallbackHttpUrl(): string | null {
    return this.config.tronFallbackHttpUrl;
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

  public get tronGridApiBaseUrl(): string {
    return this.config.tronGridApiBaseUrl;
  }

  public get tronGridApiKey(): string | null {
    return this.config.tronGridApiKey;
  }

  public get tronscanTxBaseUrl(): string {
    return this.config.tronscanTxBaseUrl;
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

  public get metricsEnabled(): boolean {
    return this.config.metricsEnabled;
  }

  public get rateLimitEtherscanMinTimeMs(): number {
    return this.config.rateLimitEtherscanMinTimeMs;
  }

  public get rateLimitEtherscanMaxConcurrent(): number {
    return this.config.rateLimitEtherscanMaxConcurrent;
  }

  public get rateLimitSolanaHeliusMinTimeMs(): number {
    return this.config.rateLimitSolanaHeliusMinTimeMs;
  }

  public get rateLimitSolanaHeliusMaxConcurrent(): number {
    return this.config.rateLimitSolanaHeliusMaxConcurrent;
  }

  public get rateLimitTronGridMinTimeMs(): number {
    return this.config.rateLimitTronGridMinTimeMs;
  }

  public get rateLimitTronGridMaxConcurrent(): number {
    return this.config.rateLimitTronGridMaxConcurrent;
  }

  public get rateLimitCoingeckoMinTimeMs(): number {
    return this.config.rateLimitCoingeckoMinTimeMs;
  }

  public get rateLimitCoingeckoMaxConcurrent(): number {
    return this.config.rateLimitCoingeckoMaxConcurrent;
  }

  public get rateLimitEthRpcMinTimeMs(): number {
    return this.config.rateLimitEthRpcMinTimeMs;
  }

  public get rateLimitEthRpcMaxConcurrent(): number {
    return this.config.rateLimitEthRpcMaxConcurrent;
  }

  private mapConfig(parsedEnv: ParsedEnv): AppConfig {
    return {
      ...this.mapCoreConfig(parsedEnv),
      ...this.mapWatcherConfig(parsedEnv),
      ...this.mapApiConfig(parsedEnv),
      ...this.mapHistoryConfig(parsedEnv),
      ...this.mapRateLimitConfig(parsedEnv),
    };
  }

  private mapCoreConfig(
    parsedEnv: ParsedEnv,
  ): Pick<
    AppConfig,
    'appVersion' | 'nodeEnv' | 'port' | 'logLevel' | 'telegramEnabled' | 'databaseUrl' | 'botToken'
  > {
    return {
      appVersion: parsedEnv.APP_VERSION,
      nodeEnv: parsedEnv.NODE_ENV,
      port: parsedEnv.PORT,
      logLevel: parsedEnv.LOG_LEVEL,
      telegramEnabled: parsedEnv.TELEGRAM_ENABLED,
      databaseUrl: parsedEnv.DATABASE_URL,
      botToken: parsedEnv.BOT_TOKEN ?? null,
    };
  }

  private mapWatcherConfig(
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
  > {
    return {
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
    };
  }

  private mapApiConfig(
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
    | 'alertMinSendIntervalSec'
    | 'tokenMetaCacheTtlSec'
  > {
    return {
      uniswapSwapAllowlist: this.parseAllowlist(parsedEnv.UNISWAP_SWAP_ALLOWLIST),
      ethCexAddressAllowlist: this.parseAllowlist(parsedEnv.ETH_CEX_ADDRESS_ALLOWLIST),
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
      alertMinSendIntervalSec: parsedEnv.ALERT_MIN_SEND_INTERVAL_SEC,
      tokenMetaCacheTtlSec: parsedEnv.TOKEN_META_CACHE_TTL_SEC,
    };
  }

  private mapHistoryConfig(
    parsedEnv: ParsedEnv,
  ): Pick<
    AppConfig,
    | 'historyCacheTtlSec'
    | 'historyRateLimitPerMinute'
    | 'historyButtonCooldownSec'
    | 'historyStaleOnErrorSec'
  > {
    return {
      historyCacheTtlSec: parsedEnv.HISTORY_CACHE_TTL_SEC,
      historyRateLimitPerMinute: parsedEnv.HISTORY_RATE_LIMIT_PER_MINUTE,
      historyButtonCooldownSec: parsedEnv.HISTORY_BUTTON_COOLDOWN_SEC,
      historyStaleOnErrorSec: parsedEnv.HISTORY_STALE_ON_ERROR_SEC,
    };
  }

  private mapRateLimitConfig(
    parsedEnv: ParsedEnv,
  ): Pick<
    AppConfig,
    | 'metricsEnabled'
    | 'rateLimitEtherscanMinTimeMs'
    | 'rateLimitEtherscanMaxConcurrent'
    | 'rateLimitSolanaHeliusMinTimeMs'
    | 'rateLimitSolanaHeliusMaxConcurrent'
    | 'rateLimitTronGridMinTimeMs'
    | 'rateLimitTronGridMaxConcurrent'
    | 'rateLimitCoingeckoMinTimeMs'
    | 'rateLimitCoingeckoMaxConcurrent'
    | 'rateLimitEthRpcMinTimeMs'
    | 'rateLimitEthRpcMaxConcurrent'
  > {
    return {
      metricsEnabled: parsedEnv.METRICS_ENABLED,
      rateLimitEtherscanMinTimeMs: parsedEnv.RATE_LIMIT_ETHERSCAN_MIN_TIME_MS,
      rateLimitEtherscanMaxConcurrent: parsedEnv.RATE_LIMIT_ETHERSCAN_MAX_CONCURRENT,
      rateLimitSolanaHeliusMinTimeMs: parsedEnv.RATE_LIMIT_SOLANA_HELIUS_MIN_TIME_MS,
      rateLimitSolanaHeliusMaxConcurrent: parsedEnv.RATE_LIMIT_SOLANA_HELIUS_MAX_CONCURRENT,
      rateLimitTronGridMinTimeMs: parsedEnv.RATE_LIMIT_TRON_GRID_MIN_TIME_MS,
      rateLimitTronGridMaxConcurrent: parsedEnv.RATE_LIMIT_TRON_GRID_MAX_CONCURRENT,
      rateLimitCoingeckoMinTimeMs: parsedEnv.RATE_LIMIT_COINGECKO_MIN_TIME_MS,
      rateLimitCoingeckoMaxConcurrent: parsedEnv.RATE_LIMIT_COINGECKO_MAX_CONCURRENT,
      rateLimitEthRpcMinTimeMs: parsedEnv.RATE_LIMIT_ETH_RPC_MIN_TIME_MS,
      rateLimitEthRpcMaxConcurrent: parsedEnv.RATE_LIMIT_ETH_RPC_MAX_CONCURRENT,
    };
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
