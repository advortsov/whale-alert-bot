import { Injectable } from '@nestjs/common';

import type { AppHealthStatus, ComponentHealth } from './health.types';
import { ChainId } from '../chain/chain.types';
import { ProviderFactory } from '../chain/providers/provider.factory';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../storage/database.service';

@Injectable()
export class HealthService {
  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly databaseService: DatabaseService,
    private readonly providerFactory: ProviderFactory,
  ) {}

  public async getHealthStatus(): Promise<AppHealthStatus> {
    const databaseOk: boolean = await this.databaseService.healthCheck();

    const rpcChecksEnabled: boolean = this.appConfigService.chainWatcherEnabled;

    const primaryProviderHealth = rpcChecksEnabled
      ? await this.providerFactory.createPrimary(ChainId.ETHEREUM_MAINNET).healthCheck()
      : {
          provider: 'alchemy-primary',
          ok: true,
          details: 'disabled by CHAIN_WATCHER_ENABLED=false',
        };
    const fallbackProviderHealth = rpcChecksEnabled
      ? await this.providerFactory.createFallback(ChainId.ETHEREUM_MAINNET).healthCheck()
      : {
          provider: 'infura-fallback',
          ok: true,
          details: 'disabled by CHAIN_WATCHER_ENABLED=false',
        };

    const database: ComponentHealth = {
      ok: databaseOk,
      details: databaseOk ? 'reachable' : 'unreachable',
    };

    const rpcPrimary: ComponentHealth = {
      ok: primaryProviderHealth.ok,
      details: primaryProviderHealth.details,
    };

    const rpcFallback: ComponentHealth = {
      ok: fallbackProviderHealth.ok,
      details: fallbackProviderHealth.details,
    };

    const telegram: ComponentHealth = {
      ok: this.appConfigService.telegramEnabled,
      details: this.appConfigService.telegramEnabled
        ? 'enabled'
        : 'disabled by TELEGRAM_ENABLED=false',
    };

    const isHealthy: boolean = database.ok && (rpcPrimary.ok || rpcFallback.ok);

    return {
      status: isHealthy ? 'ok' : 'degraded',
      database,
      rpcPrimary,
      rpcFallback,
      telegram,
    };
  }
}
