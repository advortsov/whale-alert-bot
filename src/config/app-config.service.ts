import { Injectable } from '@nestjs/common';

import { mapAppConfig } from './app-config.mapper';
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

  public get tmaEnabled(): boolean {
    return this.config.tmaEnabled;
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

  public get tmaBaseUrl(): string | null {
    return this.config.tmaBaseUrl;
  }

  public get tmaBotUsername(): string | null {
    return this.config.tmaBotUsername;
  }

  public get tmaAllowedOrigins(): readonly string[] {
    return this.config.tmaAllowedOrigins;
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

  public get historyHotCacheEnabled(): boolean {
    return this.config.historyHotCacheEnabled;
  }

  public get historyHotCacheTopWallets(): number {
    return this.config.historyHotCacheTopWallets;
  }

  public get historyHotCacheRefreshIntervalSec(): number {
    return this.config.historyHotCacheRefreshIntervalSec;
  }

  public get historyHotCachePageLimit(): number {
    return this.config.historyHotCachePageLimit;
  }

  public get historyHotCacheMaxItemsPerWallet(): number {
    return this.config.historyHotCacheMaxItemsPerWallet;
  }

  public get historyHotCacheTtlSec(): number {
    return this.config.historyHotCacheTtlSec;
  }

  public get historyHotCacheStaleSec(): number {
    return this.config.historyHotCacheStaleSec;
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

  public get rateLimitSolanaPublicMinTimeMs(): number {
    return this.config.rateLimitSolanaPublicMinTimeMs;
  }

  public get rateLimitSolanaPublicMaxConcurrent(): number {
    return this.config.rateLimitSolanaPublicMaxConcurrent;
  }

  public get rateLimitTronGridMinTimeMs(): number {
    return this.config.rateLimitTronGridMinTimeMs;
  }

  public get rateLimitTronGridMaxConcurrent(): number {
    return this.config.rateLimitTronGridMaxConcurrent;
  }

  public get rateLimitTronPublicMinTimeMs(): number {
    return this.config.rateLimitTronPublicMinTimeMs;
  }

  public get rateLimitTronPublicMaxConcurrent(): number {
    return this.config.rateLimitTronPublicMaxConcurrent;
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

  public get jwtSecret(): string | null {
    return this.config.jwtSecret;
  }

  public get jwtAccessTtlSec(): number {
    return this.config.jwtAccessTtlSec;
  }

  public get jwtRefreshTtlSec(): number {
    return this.config.jwtRefreshTtlSec;
  }

  private mapConfig(parsedEnv: ParsedEnv): AppConfig {
    return mapAppConfig(parsedEnv);
  }
}
