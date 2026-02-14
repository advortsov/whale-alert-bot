import { Module } from '@nestjs/common';

import { MetricsCollectorService } from './metrics-collector.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module';

@Module({
  imports: [RateLimitingModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsCollectorService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
