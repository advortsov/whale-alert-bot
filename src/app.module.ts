import { Module } from '@nestjs/common';

import { AlertsModule } from './alerts/alerts.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { ChainsModule } from './modules/chains/chains.module';
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
    BlockchainModule,
    ChainsModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
