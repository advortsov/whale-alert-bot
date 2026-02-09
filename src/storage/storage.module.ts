import { Module } from '@nestjs/common';

import { DatabaseService } from './database.service';
import { ProcessedEventsRepository } from './repositories/processed-events.repository';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { TrackedWalletsRepository } from './repositories/tracked-wallets.repository';
import { UsersRepository } from './repositories/users.repository';

@Module({
  providers: [
    DatabaseService,
    UsersRepository,
    TrackedWalletsRepository,
    SubscriptionsRepository,
    ProcessedEventsRepository,
  ],
  exports: [
    DatabaseService,
    UsersRepository,
    TrackedWalletsRepository,
    SubscriptionsRepository,
    ProcessedEventsRepository,
  ],
})
export class StorageModule {}
