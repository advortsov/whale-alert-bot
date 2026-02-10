import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import type { Telegraf } from 'telegraf';

import { AppConfigService } from '../config/app-config.service';

export type TelegramSendTextOptions = Parameters<Telegraf['telegram']['sendMessage']>[2];

@Injectable()
export class TelegramSenderService {
  private readonly logger: Logger = new Logger(TelegramSenderService.name);

  public constructor(
    private readonly appConfigService: AppConfigService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  public async sendText(
    telegramId: string,
    text: string,
    options: TelegramSendTextOptions = {},
  ): Promise<void> {
    this.logger.debug(
      `sendText start telegramId=${telegramId} textLength=${text.length.toString()}`,
    );

    if (!this.appConfigService.telegramEnabled) {
      this.logger.warn('Telegram sender is disabled. Message skipped.');
      return;
    }

    const chatId: number = Number(telegramId);

    if (!Number.isSafeInteger(chatId)) {
      this.logger.warn(`Invalid telegram id: ${telegramId}`);
      return;
    }

    await this.bot.telegram.sendMessage(chatId, text, options);
    this.logger.debug(`sendText success telegramId=${telegramId}`);
  }
}
