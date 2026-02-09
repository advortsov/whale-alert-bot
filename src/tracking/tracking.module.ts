import { Module } from '@nestjs/common';

import { EtherscanHistoryService } from './etherscan-history.service';
import { HistoryCacheService } from './history-cache.service';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingService } from './tracking.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [
    EtherscanHistoryService,
    HistoryCacheService,
    HistoryRateLimiterService,
    TrackingService,
  ],
  exports: [TrackingService],
})
export class TrackingModule {}
