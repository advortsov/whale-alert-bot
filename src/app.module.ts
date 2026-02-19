import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { BlockchainModule } from './modules/blockchain/blockchain.module';
import { ChainsModule } from './modules/chains/chains.module';
import { WhalesModule } from './modules/whales/whales.module';
import { ObservabilityModule } from './observability/observability.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    TelegramModule,
    WhalesModule,
    BlockchainModule,
    ChainsModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
