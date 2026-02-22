import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import type { Telegraf } from 'telegraf';
import type { MenuButton } from 'telegraf/types';

import { appendVersionQuery } from './telegram-webapp-url.util';
import { AppConfigService } from '../../../config/app-config.service';

@Injectable()
export class TelegramMenuButtonSyncService implements OnModuleInit {
  private readonly logger: Logger = new Logger(TelegramMenuButtonSyncService.name);

  public constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly appConfigService: AppConfigService,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.appConfigService.telegramEnabled) {
      return;
    }

    const tmaRootUrl: string | null = this.resolveTmaRootUrl();

    if (tmaRootUrl === null) {
      return;
    }

    const menuButton: MenuButton = {
      type: 'web_app',
      text: '🚀 Mini App',
      web_app: {
        url: tmaRootUrl,
      },
    };

    try {
      await this.bot.telegram.setChatMenuButton({ menuButton });
      this.logger.log(`Telegram menu button synced, url=${tmaRootUrl}`);
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to sync Telegram menu button: ${errorMessage}`);
    }
  }

  private resolveTmaRootUrl(): string | null {
    const configuredUrlRaw: string | null | undefined = this.appConfigService.tmaBaseUrl;

    if (typeof configuredUrlRaw !== 'string' || configuredUrlRaw.trim().length === 0) {
      return null;
    }

    const baseUrl: string = `${configuredUrlRaw.trim().replace(/\/+$/, '')}/`;
    return appendVersionQuery(baseUrl, this.appConfigService.appVersion);
  }
}
