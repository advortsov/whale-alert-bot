import { Module, forwardRef, type Type } from '@nestjs/common';

import { EthereumAddressCodec } from './ethereum/ethereum-address.codec';
import { ChainStreamServiceDependencies } from './ethereum/ethereum-chain-stream.service';
import { EventClassifierService } from './ethereum/processors/event-classifier.service';
import { AlchemyPrimaryAdapter } from './ethereum/providers/alchemy-primary.adapter';
import { InfuraFallbackAdapter } from './ethereum/providers/infura-fallback.adapter';
import { SolanaEventClassifierService } from './solana/processors/solana-event-classifier.service';
import { SolanaHeliusPrimaryAdapter } from './solana/providers/solana-helius-primary.adapter';
import { SolanaPublicFallbackAdapter } from './solana/providers/solana-public-fallback.adapter';
import { SolanaAddressCodec } from './solana/solana-address.codec';
import { SolanaChainStreamServiceDependencies } from './solana/solana-chain-stream.service';
import { TronEventClassifierService } from './tron/processors/tron-event-classifier.service';
import { TronGridPrimaryAdapter } from './tron/providers/tron-grid-primary.adapter';
import { TronPublicFallbackAdapter } from './tron/providers/tron-public-fallback.adapter';
import { TronAddressCodec } from './tron/tron-address.codec';
import {
  TronChainStreamService,
  TronChainStreamServiceDependencies,
} from './tron/tron-chain-stream.service';
import {
  ETHEREUM_ADDRESS_CODEC,
  SOLANA_ADDRESS_CODEC,
  TRON_ADDRESS_CODEC,
} from '../../common/interfaces/address/address-port.tokens';
import { DatabaseModule } from '../../database/database.module';
import {
  ETHEREUM_FALLBACK_RPC_ADAPTER,
  ETHEREUM_PRIMARY_RPC_ADAPTER,
  SOLANA_FALLBACK_RPC_ADAPTER,
  SOLANA_PRIMARY_RPC_ADAPTER,
  TRON_FALLBACK_RPC_ADAPTER,
  TRON_PRIMARY_RPC_ADAPTER,
} from '../blockchain/base/rpc-port.tokens';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ProviderFailoverService } from '../blockchain/factory/provider-failover.service';
import { ProviderFactory } from '../blockchain/factory/provider.factory';
import { HealthController } from '../blockchain/health/health.controller';
import { HealthService } from '../blockchain/health/health.service';
import { RuntimeModule } from '../runtime/runtime.module';

@Module({
  imports: [
    DatabaseModule,
    // Lazy import to break circular module dependency (chains ↔ whales)
    forwardRef(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (): Type => (require('../whales/whales.module') as { WhalesModule: Type }).WhalesModule,
    ),
    RuntimeModule,
    BlockchainModule,
  ],
  controllers: [HealthController],
  providers: [
    // --- RPC providers ---
    AlchemyPrimaryAdapter,
    InfuraFallbackAdapter,
    SolanaHeliusPrimaryAdapter,
    SolanaPublicFallbackAdapter,
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
    // --- Provider factory + failover ---
    ProviderFactory,
    ProviderFailoverService,
    HealthService,
    // --- Address codecs ---
    EthereumAddressCodec,
    SolanaAddressCodec,
    TronAddressCodec,
    {
      provide: ETHEREUM_ADDRESS_CODEC,
      useExisting: EthereumAddressCodec,
    },
    {
      provide: SOLANA_ADDRESS_CODEC,
      useExisting: SolanaAddressCodec,
    },
    {
      provide: TRON_ADDRESS_CODEC,
      useExisting: TronAddressCodec,
    },
    // --- Chain stream services ---
    EventClassifierService,
    SolanaEventClassifierService,
    TronEventClassifierService,
    ChainStreamServiceDependencies,
    SolanaChainStreamServiceDependencies,
    TronChainStreamServiceDependencies,
    TronChainStreamService,
  ],
  exports: [
    EventClassifierService,
    EthereumAddressCodec,
    SolanaAddressCodec,
    TronAddressCodec,
    ETHEREUM_ADDRESS_CODEC,
    SOLANA_ADDRESS_CODEC,
    TRON_ADDRESS_CODEC,
    ProviderFactory,
    ProviderFailoverService,
    HealthService,
  ],
})
export class ChainsModule {}
