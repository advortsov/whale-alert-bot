import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ChainModule } from '../chain/chain.module';
import { DatabaseModule } from '../database/database.module';
import { RuntimeModule } from '../runtime/runtime.module';

@Module({
  imports: [DatabaseModule, ChainModule, RuntimeModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
