import { Module } from '@nestjs/common';

import { ChainStreamService } from './chain-stream.service';
import { EventClassifierService } from './event-classifier.service';
import { AlertsModule } from '../alerts/alerts.module';
import {
  ETHEREUM_FALLBACK_RPC_ADAPTER,
  ETHEREUM_PRIMARY_RPC_ADAPTER,
  SOLANA_FALLBACK_RPC_ADAPTER,
  SOLANA_PRIMARY_RPC_ADAPTER,
} from '../core/ports/rpc/rpc-port.tokens';
import { AlchemyPrimaryAdapter } from '../integrations/rpc/ethereum/alchemy-primary.adapter';
import { InfuraFallbackAdapter } from '../integrations/rpc/ethereum/infura-fallback.adapter';
import { SolanaHeliusPrimaryAdapter } from '../integrations/rpc/solana/solana-helius-primary.adapter';
import { SolanaPublicFallbackAdapter } from '../integrations/rpc/solana/solana-public-fallback.adapter';
import { RuntimeModule } from '../runtime/runtime.module';
import { StorageModule } from '../storage/storage.module';
import { ProviderFailoverService } from './providers/provider-failover.service';
import { ProviderFactory } from './providers/provider.factory';
import { RpcThrottlerService } from './providers/rpc-throttler.service';

@Module({
  imports: [StorageModule, AlertsModule, RuntimeModule],
  providers: [
    AlchemyPrimaryAdapter,
    InfuraFallbackAdapter,
    SolanaHeliusPrimaryAdapter,
    SolanaPublicFallbackAdapter,
    {
      provide: ETHEREUM_PRIMARY_RPC_ADAPTER,
      useExisting: AlchemyPrimaryAdapter,
    },
    {
      provide: ETHEREUM_FALLBACK_RPC_ADAPTER,
      useExisting: InfuraFallbackAdapter,
    },
    {
      provide: SOLANA_PRIMARY_RPC_ADAPTER,
      useExisting: SolanaHeliusPrimaryAdapter,
    },
    {
      provide: SOLANA_FALLBACK_RPC_ADAPTER,
      useExisting: SolanaPublicFallbackAdapter,
    },
    ProviderFactory,
    RpcThrottlerService,
    ProviderFailoverService,
    EventClassifierService,
    ChainStreamService,
  ],
  exports: [ProviderFactory, ProviderFailoverService, EventClassifierService],
})
export class ChainModule {}
