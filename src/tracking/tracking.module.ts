import { Module } from '@nestjs/common';

import { TrackingService } from './tracking.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
