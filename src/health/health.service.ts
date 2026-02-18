import { Injectable } from '@nestjs/common';

import type { AppHealthStatus, ChainStreamHealth, ComponentHealth } from './health.types';
import { ProviderFactory } from '../chain/providers/provider.factory';
import { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { RuntimeStatusService } from '../runtime/runtime-status.service';
import { DatabaseService } from '../database/kysely/database.service';

interface IProviderHealthResult {
  readonly provider: string;
  readonly ok: boolean;
  readonly details: string;
}

interface IChainHealthSnapshot {
  readonly chainHealthy: boolean;
  readonly stream: ChainStreamHealth;
}

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
    const ethereum: IChainHealthSnapshot = await this.buildChainHealthSnapshot({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      enabled: this.appConfigService.chainWatcherEnabled,
      primaryProviderName: 'alchemy-primary',
      fallbackProviderName: 'infura-fallback',
      disabledReason: 'disabled by CHAIN_WATCHER_ENABLED=false',
    });
    const solana: IChainHealthSnapshot = await this.buildChainHealthSnapshot({
      chainKey: ChainKey.SOLANA_MAINNET,
      enabled: this.appConfigService.solanaWatcherEnabled,
      primaryProviderName: 'solana-helius-primary',
      fallbackProviderName: 'solana-public-fallback',
      disabledReason: 'disabled by SOLANA_WATCHER_ENABLED=false',
    });
    const tron: IChainHealthSnapshot = await this.buildChainHealthSnapshot({
      chainKey: ChainKey.TRON_MAINNET,
      enabled: this.appConfigService.tronWatcherEnabled,
      primaryProviderName: 'tron-grid-primary',
      fallbackProviderName: 'tron-public-fallback',
      disabledReason: 'disabled by TRON_WATCHER_ENABLED=false',
    });
    const database: ComponentHealth = this.buildDatabaseHealth(databaseOk);
    const telegram: ComponentHealth = this.buildTelegramHealth();
    const isHealthy: boolean =
      database.ok && ethereum.chainHealthy && solana.chainHealthy && tron.chainHealthy;

    return {
      status: isHealthy ? 'ok' : 'degraded',
      database,
      ethereum: ethereum.stream,
      solana: solana.stream,
      tron: tron.stream,
      telegram,
    };
  }

  private buildDatabaseHealth(databaseOk: boolean): ComponentHealth {
    return {
      ok: databaseOk,
      details: databaseOk ? 'reachable' : 'unreachable',
    };
  }

  private buildTelegramHealth(): ComponentHealth {
    return {
      ok: this.appConfigService.telegramEnabled,
      details: this.appConfigService.telegramEnabled
        ? 'enabled'
        : 'disabled by TELEGRAM_ENABLED=false',
    };
  }

  private async buildChainHealthSnapshot(input: {
    readonly chainKey: ChainKey;
    readonly enabled: boolean;
    readonly primaryProviderName: string;
    readonly fallbackProviderName: string;
    readonly disabledReason: string;
  }): Promise<IChainHealthSnapshot> {
    const primaryResult: IProviderHealthResult = await this.resolveProviderHealth({
      enabled: input.enabled,
      chainKey: input.chainKey,
      providerName: input.primaryProviderName,
      disabledReason: input.disabledReason,
      primary: true,
    });
    const fallbackResult: IProviderHealthResult = await this.resolveProviderHealth({
      enabled: input.enabled,
      chainKey: input.chainKey,
      providerName: input.fallbackProviderName,
      disabledReason: input.disabledReason,
      primary: false,
    });
    const rpcPrimary: ComponentHealth = this.toComponentHealth(primaryResult);
    const rpcFallback: ComponentHealth = this.toComponentHealth(fallbackResult);

    return {
      chainHealthy: !input.enabled || rpcPrimary.ok || rpcFallback.ok,
      stream: {
        rpcPrimary,
        rpcFallback,
        runtime: this.runtimeStatusService.getChainSnapshot(input.chainKey),
      },
    };
  }

  private async resolveProviderHealth(input: {
    readonly enabled: boolean;
    readonly chainKey: ChainKey;
    readonly providerName: string;
    readonly disabledReason: string;
    readonly primary: boolean;
  }): Promise<IProviderHealthResult> {
    if (!input.enabled) {
      return {
        provider: input.providerName,
        ok: true,
        details: input.disabledReason,
      };
    }

    if (input.primary) {
      return this.providerFactory.createPrimary(input.chainKey).healthCheck();
    }

    return this.providerFactory.createFallback(input.chainKey).healthCheck();
  }

  private toComponentHealth(result: IProviderHealthResult): ComponentHealth {
    return {
      ok: result.ok,
      details: result.details,
    };
  }
}
