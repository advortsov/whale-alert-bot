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
import { AddressCodecRegistry } from '../integrations/address/address-codec.registry';
import { EthereumAddressCodec } from '../integrations/address/ethereum/ethereum-address.codec';
import { SolanaAddressCodec } from '../integrations/address/solana/solana-address.codec';
import { TronAddressCodec } from '../integrations/address/tron/tron-address.codec';
import { EtherscanHistoryAdapter } from '../integrations/explorers/etherscan/etherscan-history.adapter';
import { HistoryExplorerRouterAdapter } from '../integrations/explorers/history-explorer-router.adapter';
import { SolanaRpcHistoryAdapter } from '../integrations/explorers/solana/solana-rpc-history.adapter';
import { TronGridHistoryAdapter } from '../integrations/explorers/tron/tron-grid-history.adapter';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';

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
