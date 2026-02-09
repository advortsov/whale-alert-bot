import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import type { TelegrafModuleOptions } from 'nestjs-telegraf/dist/interfaces/telegraf-options.interface';

import { TelegramSenderService } from './telegram-sender.service';
import { TelegramUpdate } from './telegram.update';
import { AppConfigService } from '../config/app-config.service';
import { TrackingModule } from '../tracking/tracking.module';

const createTelegrafOptions = (appConfigService: AppConfigService): TelegrafModuleOptions => {
  const fallbackToken: string = '0000000000:TEST_TOKEN_FOR_DISABLED_TELEGRAM';

  if (appConfigService.telegramEnabled && !appConfigService.botToken) {
    throw new Error('BOT_TOKEN is required when TELEGRAM_ENABLED=true');
  }

  return {
    token: appConfigService.botToken ?? fallbackToken,
    launchOptions: appConfigService.telegramEnabled ? {} : false,
  };
};

@Module({
  imports: [
    TrackingModule,
    TelegrafModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: createTelegrafOptions,
    }),
  ],
  providers: [TelegramUpdate, TelegramSenderService],
  exports: [TelegramSenderService],
})
export class TelegramModule {}
