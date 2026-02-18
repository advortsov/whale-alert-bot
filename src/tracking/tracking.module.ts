import { Module } from '@nestjs/common';

import { EtherscanHistoryService } from './etherscan-history.service';
import { HistoryCacheService } from './history-cache.service';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingAddressService } from './tracking-address.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingHistoryQueryParserService } from './tracking-history-query-parser.service';
import {
  TrackingHistoryService,
  TrackingHistoryServiceDependencies,
} from './tracking-history.service';
import { TrackingSettingsParserService } from './tracking-settings-parser.service';
import {
  TrackingSettingsService,
  TrackingSettingsServiceDependencies,
} from './tracking-settings.service';
import {
  TrackingWalletsService,
  TrackingWalletsServiceDependencies,
} from './tracking-wallets.service';
import { TrackingService } from './tracking.service';
import { ADDRESS_CODEC_REGISTRY } from '../common/interfaces/address/address-port.tokens';
import { HISTORY_EXPLORER_ADAPTER } from '../common/interfaces/explorers/explorer-port.tokens';
import { DatabaseModule } from '../database/database.module';
import { EtherscanHistoryAdapter } from '../integrations/explorers/etherscan/etherscan-history.adapter';
import { HistoryExplorerRouterAdapter } from '../integrations/explorers/history-explorer-router.adapter';
import { TronGridHistoryAdapter } from '../integrations/explorers/tron/tron-grid-history.adapter';
import { AddressCodecRegistry } from '../modules/blockchain/address-codec.registry';
import { RateLimitingModule } from '../modules/blockchain/rate-limiting/rate-limiting.module';
import { EthereumAddressCodec } from '../modules/chains/ethereum/ethereum-address.codec';
import { SolanaAddressCodec } from '../modules/chains/solana/solana-address.codec';
import { SolanaRpcHistoryAdapter } from '../modules/chains/solana/solana-rpc-history.adapter';
import { TronAddressCodec } from '../modules/chains/tron/tron-address.codec';

@Module({
  imports: [DatabaseModule, RateLimitingModule],
  providers: [
    EthereumAddressCodec,
    SolanaAddressCodec,
    TronAddressCodec,
    AddressCodecRegistry,
    {
      provide: ADDRESS_CODEC_REGISTRY,
      useExisting: AddressCodecRegistry,
    },
    EtherscanHistoryAdapter,
    SolanaRpcHistoryAdapter,
    TronGridHistoryAdapter,
    HistoryExplorerRouterAdapter,
    EtherscanHistoryService,
    {
      provide: HISTORY_EXPLORER_ADAPTER,
      useExisting: HistoryExplorerRouterAdapter,
    },
    HistoryCacheService,
    HistoryRateLimiterService,
    TrackingAddressService,
    TrackingHistoryFormatterService,
    TrackingHistoryQueryParserService,
    TrackingSettingsParserService,
    TrackingWalletsServiceDependencies,
    TrackingWalletsService,
    TrackingSettingsServiceDependencies,
    TrackingSettingsService,
    TrackingHistoryServiceDependencies,
    TrackingHistoryService,
    TrackingService,
  ],
  exports: [TrackingService],
})
export class TrackingModule {}
