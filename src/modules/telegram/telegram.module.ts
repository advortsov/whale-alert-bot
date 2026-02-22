import { Global, Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import type { TelegrafModuleOptions } from 'nestjs-telegraf/dist/interfaces/telegraf-options.interface';

import {
  TelegramBasicCommandsService,
  TelegramBasicCommandsServiceDependencies,
} from './bot/telegram-basic-commands.service';
import {
  TelegramCallbackCommandsService,
  TelegramCallbackCommandsServiceDependencies,
} from './bot/telegram-callback-commands.service';
import { TelegramCallbackParserService } from './bot/telegram-callback-parser.service';
import { TelegramCommandOrchestratorService } from './bot/telegram-command-orchestrator.service';
import {
  TelegramFilterCommandsService,
  TelegramFilterCommandsServiceDependencies,
} from './bot/telegram-filter-commands.service';
import { TelegramMenuButtonSyncService } from './bot/telegram-menu-button-sync.service';
import { TelegramParserService } from './bot/telegram-parser.service';
import { TelegramSenderService } from './bot/telegram-sender.service';
import { TelegramUiService } from './bot/telegram-ui.service';
import { TelegramUpdate } from './bot/telegram.update';
import { AppConfigService } from '../../config/app-config.service';
import { RuntimeModule } from '../runtime/runtime.module';
import { WhalesModule } from '../whales/whales.module';

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

@Global()
@Module({
  imports: [
    WhalesModule,
    RuntimeModule,
    TelegrafModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: createTelegrafOptions,
    }),
  ],
  providers: [
    TelegramParserService,
    TelegramCallbackParserService,
    TelegramUiService,
    TelegramBasicCommandsServiceDependencies,
    TelegramBasicCommandsService,
    TelegramFilterCommandsServiceDependencies,
    TelegramFilterCommandsService,
    TelegramCallbackCommandsServiceDependencies,
    TelegramCallbackCommandsService,
    TelegramCommandOrchestratorService,
    TelegramUpdate,
    TelegramMenuButtonSyncService,
    TelegramSenderService,
  ],
  exports: [TelegramSenderService],
})
export class TelegramModule {}
