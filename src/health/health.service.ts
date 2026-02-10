import { Injectable } from '@nestjs/common';

import type { AppHealthStatus, ComponentHealth } from './health.types';
import { ProviderFactory } from '../chain/providers/provider.factory';
import { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { DatabaseService } from '../storage/database.service';

@Injectable()
export class HealthService {
  private static readonly SOLANA_HEALTH_TIMEOUT_MS: number = 5000;

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly databaseService: DatabaseService,
    private readonly providerFactory: ProviderFactory,
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

    const solanaPrimaryHealth: ComponentHealth = solanaRpcChecksEnabled
      ? await this.checkSolanaRpcEndpoint(
          this.appConfigService.solanaHeliusHttpUrl,
          'solana-helius-primary',
        )
      : {
          ok: true,
          details: 'disabled by SOLANA_WATCHER_ENABLED=false',
        };

    const solanaFallbackHealth: ComponentHealth = solanaRpcChecksEnabled
      ? await this.checkSolanaRpcEndpoint(
          this.appConfigService.solanaPublicHttpUrl,
          'solana-public-fallback',
        )
      : {
          ok: true,
          details: 'disabled by SOLANA_WATCHER_ENABLED=false',
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

    const ethereumChainHealthy: boolean =
      !ethereumRpcChecksEnabled || ethereumRpcPrimary.ok || ethereumRpcFallback.ok;
    const solanaChainHealthy: boolean =
      !solanaRpcChecksEnabled || solanaPrimaryHealth.ok || solanaFallbackHealth.ok;
    const isHealthy: boolean = database.ok && ethereumChainHealthy && solanaChainHealthy;

    return {
      status: isHealthy ? 'ok' : 'degraded',
      database,
      ethereumRpcPrimary,
      ethereumRpcFallback,
      solanaRpcPrimary: solanaPrimaryHealth,
      solanaRpcFallback: solanaFallbackHealth,
      telegram,
    };
  }

  private async checkSolanaRpcEndpoint(
    endpointUrl: string | null,
    endpointName: string,
  ): Promise<ComponentHealth> {
    if (!endpointUrl) {
      return {
        ok: false,
        details: `${endpointName} endpoint is not configured`,
      };
    }

    const abortController: AbortController = new AbortController();
    const timeoutHandle: NodeJS.Timeout = setTimeout((): void => {
      abortController.abort();
    }, HealthService.SOLANA_HEALTH_TIMEOUT_MS);

    try {
      const response: Response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSlot',
          params: [],
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        return {
          ok: false,
          details: `${endpointName} returned HTTP ${String(response.status)}`,
        };
      }

      const responseBody: unknown = await response.json();
      const slotValue: unknown = (responseBody as { readonly result?: unknown }).result;

      if (typeof slotValue !== 'number') {
        return {
          ok: false,
          details: `${endpointName} returned invalid getSlot payload`,
        };
      }

      return {
        ok: true,
        details: `${endpointName} reachable, slot=${String(slotValue)}`,
      };
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        details: `${endpointName} request failed: ${errorMessage}`,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
