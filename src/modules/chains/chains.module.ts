import { Module } from '@nestjs/common';

import {
  ChainStreamService,
  ChainStreamServiceDependencies,
} from './ethereum/ethereum-chain-stream.service';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { EventClassifierService } from './ethereum/processors/event-classifier.service';
import { AlchemyPrimaryAdapter } from './ethereum/providers/alchemy-primary.adapter';
import { InfuraFallbackAdapter } from './ethereum/providers/infura-fallback.adapter';
import { SolanaHeliusPrimaryAdapter } from './solana/providers/solana-helius-primary.adapter';
import { SolanaPublicFallbackAdapter } from './solana/providers/solana-public-fallback.adapter';
import {
  SolanaChainStreamService,
  SolanaChainStreamServiceDependencies,
} from './solana/solana-chain-stream.service';
import { TronGridPrimaryAdapter } from './tron/providers/tron-grid-primary.adapter';
import { TronAddressCodec } from './tron/tron-address.codec';
import { AlertsModule } from '../../alerts/alerts.module';
import { SolanaEventClassifierService } from './solana/processors/solana-event-classifier.service';
import { TronEventClassifierService } from './tron/processors/tron-event-classifier.service';
import {
  TronChainStreamService,
  TronChainStreamServiceDependencies,
} from './tron/tron-chain-stream.service';
import { DatabaseModule } from '../../database/database.module';
import { TronPublicFallbackAdapter } from './tron/providers/tron-public-fallback.adapter';
import { RuntimeModule } from '../../runtime/runtime.module';
import {
  ETHEREUM_FALLBACK_RPC_ADAPTER,
  ETHEREUM_PRIMARY_RPC_ADAPTER,
  SOLANA_FALLBACK_RPC_ADAPTER,
  SOLANA_PRIMARY_RPC_ADAPTER,
  TRON_FALLBACK_RPC_ADAPTER,
  TRON_PRIMARY_RPC_ADAPTER,
} from '../blockchain/base/rpc-port.tokens';

@Module({
  imports: [DatabaseModule, AlertsModule, RuntimeModule, BlockchainModule],
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
  exports: [EventClassifierService],
})
export class ChainsModule {}
