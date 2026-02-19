import { Global, Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import type { TelegrafModuleOptions } from 'nestjs-telegraf/dist/interfaces/telegraf-options.interface';

import {
  TelegramBasicCommandsService,
  TelegramBasicCommandsServiceDependencies,
} from './telegram-basic-commands.service';
import {
  TelegramCallbackCommandsService,
  TelegramCallbackCommandsServiceDependencies,
} from './telegram-callback-commands.service';
import { TelegramCallbackParserService } from './telegram-callback-parser.service';
import { TelegramCommandOrchestratorService } from './telegram-command-orchestrator.service';
import {
  TelegramFilterCommandsService,
  TelegramFilterCommandsServiceDependencies,
} from './telegram-filter-commands.service';
import { TelegramParserService } from './telegram-parser.service';
import { TelegramSenderService } from './telegram-sender.service';
import { TelegramUiService } from './telegram-ui.service';
import { TelegramUpdate } from './telegram.update';
import { AppConfigService } from '../config/app-config.service';
import { WhalesModule } from '../modules/whales/whales.module';
import { RuntimeModule } from '../runtime/runtime.module';

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
    TelegramSenderService,
  ],
  exports: [TelegramSenderService],
})
export class TelegramModule {}
