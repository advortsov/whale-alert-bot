import { Module } from '@nestjs/common';

import { ChainStreamService } from './chain-stream.service';
import { EventClassifierService } from './event-classifier.service';
import { AlertsModule } from '../alerts/alerts.module';
import { StorageModule } from '../storage/storage.module';
import { FALLBACK_RPC_PROVIDER, PRIMARY_RPC_PROVIDER } from './constants/chain.tokens';
import { AlchemyPrimaryProvider } from './providers/alchemy-primary.provider';
import { InfuraFallbackProvider } from './providers/infura-fallback.provider';
import { ProviderFailoverService } from './providers/provider-failover.service';
import { ProviderFactory } from './providers/provider.factory';

@Module({
  imports: [StorageModule, AlertsModule],
  providers: [
    AlchemyPrimaryProvider,
    InfuraFallbackProvider,
    {
      provide: PRIMARY_RPC_PROVIDER,
      useExisting: AlchemyPrimaryProvider,
    },
    {
      provide: FALLBACK_RPC_PROVIDER,
      useExisting: InfuraFallbackProvider,
    },
    ProviderFactory,
    ProviderFailoverService,
    EventClassifierService,
    ChainStreamService,
  ],
  exports: [ProviderFactory, ProviderFailoverService, EventClassifierService],
})
export class ChainModule {}
