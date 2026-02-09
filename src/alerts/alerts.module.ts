import { Module } from '@nestjs/common';

import { AlertDispatcherService } from './alert-dispatcher.service';
import { AlertMessageFormatter } from './alert-message.formatter';
import { StorageModule } from '../storage/storage.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [StorageModule, TelegramModule],
  providers: [AlertMessageFormatter, AlertDispatcherService],
  exports: [AlertMessageFormatter, AlertDispatcherService],
})
export class AlertsModule {}
