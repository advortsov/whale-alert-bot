import { Injectable } from '@nestjs/common';

import type { AppHealthStatus, ChainStreamHealth, ComponentHealth } from './health.types';
import { ProviderFactory } from '../chain/providers/provider.factory';
import { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { RuntimeStatusService } from '../runtime/runtime-status.service';
import { DatabaseService } from '../storage/database.service';

@Injectable()
export class HealthService {
  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly databaseService: DatabaseService,
    private readonly providerFactory: ProviderFactory,
    private readonly runtimeStatusService: RuntimeStatusService,
  ) {}

  public async getHealthStatus(): Promise<AppHealthStatus> {
    const databaseOk: boolean = await this.databaseService.healthCheck();

    const ethereumRpcChecksEnabled: boolean = this.appConfigService.chainWatcherEnabled;

    const ethereumPrimaryProviderHealth = ethereumRpcChecksEnabled
      ? await this.providerFactory.createPrimary(ChainKey.ETHEREUM_MAINNET).healthCheck()
      : {
          provider: 'alchemy-primary',
          ok: true,
          details: 'disabled by CHAIN_WATCHER_ENABLED=false',
        };
    const ethereumFallbackProviderHealth = ethereumRpcChecksEnabled
      ? await this.providerFactory.createFallback(ChainKey.ETHEREUM_MAINNET).healthCheck()
      : {
          provider: 'infura-fallback',
          ok: true,
          details: 'disabled by CHAIN_WATCHER_ENABLED=false',
        };
    const solanaRpcChecksEnabled: boolean = this.appConfigService.solanaWatcherEnabled;

    const solanaPrimaryProviderHealth = solanaRpcChecksEnabled
      ? await this.providerFactory.createPrimary(ChainKey.SOLANA_MAINNET).healthCheck()
      : {
          provider: 'solana-helius-primary',
          ok: true,
          details: 'disabled by SOLANA_WATCHER_ENABLED=false',
        };

    const solanaFallbackProviderHealth = solanaRpcChecksEnabled
      ? await this.providerFactory.createFallback(ChainKey.SOLANA_MAINNET).healthCheck()
      : {
          provider: 'solana-public-fallback',
          ok: true,
          details: 'disabled by SOLANA_WATCHER_ENABLED=false',
        };
    const tronRpcChecksEnabled: boolean = this.appConfigService.tronWatcherEnabled;

    const tronPrimaryProviderHealth = tronRpcChecksEnabled
      ? await this.providerFactory.createPrimary(ChainKey.TRON_MAINNET).healthCheck()
      : {
          provider: 'tron-grid-primary',
          ok: true,
          details: 'disabled by TRON_WATCHER_ENABLED=false',
        };

    const tronFallbackProviderHealth = tronRpcChecksEnabled
      ? await this.providerFactory.createFallback(ChainKey.TRON_MAINNET).healthCheck()
      : {
          provider: 'tron-public-fallback',
          ok: true,
          details: 'disabled by TRON_WATCHER_ENABLED=false',
        };

    const database: ComponentHealth = {
      ok: databaseOk,
      details: databaseOk ? 'reachable' : 'unreachable',
    };

    const ethereumRpcPrimary: ComponentHealth = {
      ok: ethereumPrimaryProviderHealth.ok,
      details: ethereumPrimaryProviderHealth.details,
    };

    const ethereumRpcFallback: ComponentHealth = {
      ok: ethereumFallbackProviderHealth.ok,
      details: ethereumFallbackProviderHealth.details,
    };

    const telegram: ComponentHealth = {
      ok: this.appConfigService.telegramEnabled,
      details: this.appConfigService.telegramEnabled
        ? 'enabled'
        : 'disabled by TELEGRAM_ENABLED=false',
    };

    const solanaPrimaryHealth: ComponentHealth = {
      ok: solanaPrimaryProviderHealth.ok,
      details: solanaPrimaryProviderHealth.details,
    };

    const solanaFallbackHealth: ComponentHealth = {
      ok: solanaFallbackProviderHealth.ok,
      details: solanaFallbackProviderHealth.details,
    };
    const tronPrimaryHealth: ComponentHealth = {
      ok: tronPrimaryProviderHealth.ok,
      details: tronPrimaryProviderHealth.details,
    };

    const tronFallbackHealth: ComponentHealth = {
      ok: tronFallbackProviderHealth.ok,
      details: tronFallbackProviderHealth.details,
    };

    const ethereumChainHealthy: boolean =
      !ethereumRpcChecksEnabled || ethereumRpcPrimary.ok || ethereumRpcFallback.ok;
    const solanaChainHealthy: boolean =
      !solanaRpcChecksEnabled || solanaPrimaryHealth.ok || solanaFallbackHealth.ok;
    const tronChainHealthy: boolean =
      !tronRpcChecksEnabled || tronPrimaryHealth.ok || tronFallbackHealth.ok;
    const isHealthy: boolean =
      database.ok && ethereumChainHealthy && solanaChainHealthy && tronChainHealthy;

    const ethereum: ChainStreamHealth = {
      rpcPrimary: ethereumRpcPrimary,
      rpcFallback: ethereumRpcFallback,
      runtime: this.runtimeStatusService.getChainSnapshot(ChainKey.ETHEREUM_MAINNET),
    };

    const solana: ChainStreamHealth = {
      rpcPrimary: solanaPrimaryHealth,
      rpcFallback: solanaFallbackHealth,
      runtime: this.runtimeStatusService.getChainSnapshot(ChainKey.SOLANA_MAINNET),
    };

    const tron: ChainStreamHealth = {
      rpcPrimary: tronPrimaryHealth,
      rpcFallback: tronFallbackHealth,
      runtime: this.runtimeStatusService.getChainSnapshot(ChainKey.TRON_MAINNET),
    };

    return {
      status: isHealthy ? 'ok' : 'degraded',
      database,
      ethereum,
      solana,
      tron,
      telegram,
    };
  }
}
