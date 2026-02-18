import { Module } from '@nestjs/common';

import { MetricsCollectorService } from './metrics-collector.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { DatabaseModule } from '../database/database.module';
import { RateLimitingModule } from '../modules/blockchain/rate-limiting/rate-limiting.module';

@Module({
  imports: [RateLimitingModule, DatabaseModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsCollectorService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
