import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ChainModule } from '../chain/chain.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule, ChainModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
