import { Module } from '@nestjs/common';

import { DatabaseService } from './database.service';
import { ChainCheckpointsRepository } from './repositories/chain-checkpoints.repository';
import { ProcessedEventsRepository } from './repositories/processed-events.repository';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { TrackedWalletsRepository } from './repositories/tracked-wallets.repository';
import { UserAlertPreferencesRepository } from './repositories/user-alert-preferences.repository';
import { UsersRepository } from './repositories/users.repository';

@Module({
  providers: [
    DatabaseService,
    ChainCheckpointsRepository,
    UsersRepository,
    TrackedWalletsRepository,
    SubscriptionsRepository,
    ProcessedEventsRepository,
    UserAlertPreferencesRepository,
  ],
  exports: [
    DatabaseService,
    ChainCheckpointsRepository,
    UsersRepository,
    TrackedWalletsRepository,
    SubscriptionsRepository,
    ProcessedEventsRepository,
    UserAlertPreferencesRepository,
  ],
})
export class StorageModule {}
