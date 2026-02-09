import { Module } from '@nestjs/common';

import { EtherscanHistoryService } from './etherscan-history.service';
import { HistoryCacheService } from './history-cache.service';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingService } from './tracking.service';
import { HISTORY_EXPLORER_ADAPTER } from '../core/ports/explorers/explorer-port.tokens';
import { EtherscanHistoryAdapter } from '../integrations/explorers/etherscan/etherscan-history.adapter';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [
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
