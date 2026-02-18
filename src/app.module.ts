import { Module } from '@nestjs/common';

import { AlertsModule } from './alerts/alerts.module';
import { ChainModule } from './chain/chain.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ObservabilityModule } from './observability/observability.module';
import { TelegramModule } from './telegram/telegram.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    TrackingModule,
    TelegramModule,
    AlertsModule,
    ChainModule,
    HealthModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
