import { Module } from '@nestjs/common';

import { EtherscanHistoryService } from './etherscan-history.service';
import { HistoryCacheService } from './history-cache.service';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingService } from './tracking.service';
import { ADDRESS_CODEC_REGISTRY } from '../core/ports/address/address-port.tokens';
import { HISTORY_EXPLORER_ADAPTER } from '../core/ports/explorers/explorer-port.tokens';
import { AddressCodecRegistry } from '../integrations/address/address-codec.registry';
import { EthereumAddressCodec } from '../integrations/address/ethereum/ethereum-address.codec';
import { SolanaAddressCodec } from '../integrations/address/solana/solana-address.codec';
import { EtherscanHistoryAdapter } from '../integrations/explorers/etherscan/etherscan-history.adapter';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [
    EthereumAddressCodec,
    SolanaAddressCodec,
    AddressCodecRegistry,
    {
      provide: ADDRESS_CODEC_REGISTRY,
      useExisting: AddressCodecRegistry,
    },
    EtherscanHistoryAdapter,
    EtherscanHistoryService,
    {
      provide: HISTORY_EXPLORER_ADAPTER,
      useExisting: EtherscanHistoryAdapter,
    },
    HistoryCacheService,
    HistoryRateLimiterService,
    TrackingService,
  ],
  exports: [TrackingService],
})
export class TrackingModule {}
