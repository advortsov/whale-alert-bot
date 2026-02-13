import { Module } from '@nestjs/common';

import { ChainStreamService, ChainStreamServiceDependencies } from './chain-stream.service';
import { EventClassifierService } from './event-classifier.service';
import { AlertsModule } from '../alerts/alerts.module';
import {
  SolanaChainStreamService,
  SolanaChainStreamServiceDependencies,
} from '../chains/solana/solana-chain-stream.service';
import { SolanaEventClassifierService } from '../chains/solana/solana-event-classifier.service';
import {
  TronChainStreamService,
  TronChainStreamServiceDependencies,
} from '../chains/tron/tron-chain-stream.service';
import { TronEventClassifierService } from '../chains/tron/tron-event-classifier.service';
import {
  ETHEREUM_FALLBACK_RPC_ADAPTER,
  ETHEREUM_PRIMARY_RPC_ADAPTER,
  SOLANA_FALLBACK_RPC_ADAPTER,
  SOLANA_PRIMARY_RPC_ADAPTER,
  TRON_FALLBACK_RPC_ADAPTER,
  TRON_PRIMARY_RPC_ADAPTER,
} from '../core/ports/rpc/rpc-port.tokens';
import { TronAddressCodec } from '../integrations/address/tron/tron-address.codec';
import { AlchemyPrimaryAdapter } from '../integrations/rpc/ethereum/alchemy-primary.adapter';
import { InfuraFallbackAdapter } from '../integrations/rpc/ethereum/infura-fallback.adapter';
import { SolanaHeliusPrimaryAdapter } from '../integrations/rpc/solana/solana-helius-primary.adapter';
import { SolanaPublicFallbackAdapter } from '../integrations/rpc/solana/solana-public-fallback.adapter';
import { TronGridPrimaryAdapter } from '../integrations/rpc/tron/tron-grid-primary.adapter';
import { TronPublicFallbackAdapter } from '../integrations/rpc/tron/tron-public-fallback.adapter';
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
    TronAddressCodec,
    TronGridPrimaryAdapter,
    TronPublicFallbackAdapter,
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
    {
      provide: TRON_PRIMARY_RPC_ADAPTER,
      useExisting: TronGridPrimaryAdapter,
    },
    {
      provide: TRON_FALLBACK_RPC_ADAPTER,
      useExisting: TronPublicFallbackAdapter,
    },
    ProviderFactory,
    RpcThrottlerService,
    ProviderFailoverService,
    EventClassifierService,
    SolanaEventClassifierService,
    TronEventClassifierService,
    ChainStreamServiceDependencies,
    SolanaChainStreamServiceDependencies,
    TronChainStreamServiceDependencies,
    ChainStreamService,
    SolanaChainStreamService,
    TronChainStreamService,
  ],
  exports: [ProviderFactory, ProviderFailoverService, EventClassifierService],
})
export class ChainModule {}
