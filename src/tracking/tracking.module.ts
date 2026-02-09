import { Module } from '@nestjs/common';

import { EtherscanHistoryService } from './etherscan-history.service';
import { TrackingService } from './tracking.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [EtherscanHistoryService, TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
