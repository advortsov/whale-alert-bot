import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ApiModule } from './modules/api/api.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { ChainsModule } from './modules/chains/chains.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { WhalesModule } from './modules/whales/whales.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ApiModule,
    AnalyticsModule,
    NotificationsModule,
    TelegramModule,
    WhalesModule,
    BlockchainModule,
    ChainsModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
