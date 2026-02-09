import { Module } from '@nestjs/common';

import { ChainStreamService } from './chain-stream.service';
import { EventClassifierService } from './event-classifier.service';
import { AlertsModule } from '../alerts/alerts.module';
import { FALLBACK_RPC_ADAPTER, PRIMARY_RPC_ADAPTER } from '../core/ports/rpc/rpc-port.tokens';
import { AlchemyPrimaryAdapter } from '../integrations/rpc/ethereum/alchemy-primary.adapter';
import { InfuraFallbackAdapter } from '../integrations/rpc/ethereum/infura-fallback.adapter';
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
    {
      provide: PRIMARY_RPC_ADAPTER,
      useExisting: AlchemyPrimaryAdapter,
    },
    {
      provide: FALLBACK_RPC_ADAPTER,
      useExisting: InfuraFallbackAdapter,
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
