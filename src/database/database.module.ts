import { Module } from '@nestjs/common';

import { DatabaseService } from './kysely/database.service';
import { MigrationService } from './migrations/migration.service';
import { AlertMutesRepository } from './repositories/alert-mutes.repository';
import { ChainCheckpointsRepository } from './repositories/chain-checkpoints.repository';
import { ProcessedEventsRepository } from './repositories/processed-events.repository';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { TrackedWalletsRepository } from './repositories/tracked-wallets.repository';
import { UserAlertPreferencesRepository } from './repositories/user-alert-preferences.repository';
import { UserAlertSettingsRepository } from './repositories/user-alert-settings.repository';
import { UserWalletAlertPreferencesRepository } from './repositories/user-wallet-alert-preferences.repository';
import { UsersRepository } from './repositories/users.repository';
import { WalletEventsRepository } from './repositories/wallet-events.repository';

@Module({
  providers: [
    MigrationService,
    DatabaseService,
    ChainCheckpointsRepository,
    AlertMutesRepository,
    UsersRepository,
    TrackedWalletsRepository,
    SubscriptionsRepository,
    ProcessedEventsRepository,
    UserAlertPreferencesRepository,
    UserAlertSettingsRepository,
    UserWalletAlertPreferencesRepository,
    WalletEventsRepository,
  ],
  exports: [
    DatabaseService,
    ChainCheckpointsRepository,
    AlertMutesRepository,
    UsersRepository,
    TrackedWalletsRepository,
    SubscriptionsRepository,
    ProcessedEventsRepository,
    UserAlertPreferencesRepository,
    UserAlertSettingsRepository,
    UserWalletAlertPreferencesRepository,
    WalletEventsRepository,
  ],
})
export class DatabaseModule {}
