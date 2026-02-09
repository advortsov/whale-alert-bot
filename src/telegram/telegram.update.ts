import { Logger } from '@nestjs/common';
import { Ctx, On, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import type { Message } from 'telegraf/typings/core/types/typegram';

import { TrackingService, type TelegramUserRef } from '../tracking/tracking.service';

enum SupportedTelegramCommand {
  START = 'start',
  HELP = 'help',
  TRACK = 'track',
  LIST = 'list',
  UNTRACK = 'untrack',
}

type ParsedTextCommand = {
  readonly command: SupportedTelegramCommand | null;
  readonly args: readonly string[];
  readonly rawText: string;
};

type UpdateMeta = {
  readonly updateId: number | null;
  readonly chatId: string | null;
  readonly messageId: number | null;
};

const SUPPORTED_COMMAND_MAP: Readonly<Record<string, SupportedTelegramCommand>> = {
  start: SupportedTelegramCommand.START,
  help: SupportedTelegramCommand.HELP,
  track: SupportedTelegramCommand.TRACK,
  list: SupportedTelegramCommand.LIST,
  untrack: SupportedTelegramCommand.UNTRACK,
};

@Update()
export class TelegramUpdate {
  private readonly logger: Logger = new Logger(TelegramUpdate.name);
  private readonly userCommandQueue: Map<string, Promise<void>> = new Map<string, Promise<void>>();

  public constructor(private readonly trackingService: TrackingService) {}

  @On('text')
  public async onText(@Ctx() ctx: Context): Promise<void> {
    const text: string | null = this.getText(ctx);
    const userRef: TelegramUserRef | null = this.getUserRef(ctx);
    const updateMeta: UpdateMeta = this.getUpdateMeta(ctx);

    if (!text) {
      this.logger.debug(
        `Incoming text update without message text updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return;
    }

    const parsedCommand: ParsedTextCommand = this.parseTextCommand(text);

    if (parsedCommand.command === null) {
      this.logger.debug(
        `Ignore non-command text updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} messageId=${updateMeta.messageId ?? 'n/a'} text="${text}"`,
      );
      return;
    }

    this.logger.log(
      `Incoming command=${parsedCommand.command} updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} messageId=${updateMeta.messageId ?? 'n/a'} telegramId=${userRef?.telegramId ?? 'unknown'} payload="${text}"`,
    );

    switch (parsedCommand.command) {
      case SupportedTelegramCommand.START:
        await this.handleStart(ctx, userRef, updateMeta);
        return;
      case SupportedTelegramCommand.HELP:
        await this.handleHelp(ctx, userRef, updateMeta);
        return;
      case SupportedTelegramCommand.TRACK:
        await this.handleTrack(ctx, userRef, updateMeta, parsedCommand.args);
        return;
      case SupportedTelegramCommand.LIST:
        await this.handleList(ctx, userRef, updateMeta);
        return;
      case SupportedTelegramCommand.UNTRACK:
        await this.handleUntrack(ctx, userRef, updateMeta, parsedCommand.args);
        return;
      default:
        await this.replyWithLog(ctx, 'Неизвестная команда. Используй /help.', updateMeta);
    }
  }

  private async handleStart(
    ctx: Context,
    userRef: TelegramUserRef | null,
    updateMeta: UpdateMeta,
  ): Promise<void> {
    this.logger.log(
      `Handle /start telegramId=${userRef?.telegramId ?? 'unknown'} username=${userRef?.username ?? 'n/a'} updateId=${updateMeta.updateId ?? 'n/a'}`,
    );

    await this.replyWithLog(
      ctx,
      [
        'Привет. Я отслеживаю активность китов в Ethereum.',
        'Команды:',
        '/track <address> [label]',
        '/list',
        '/untrack <address|id>',
        '/help',
      ].join('\n'),
      updateMeta,
    );
  }

  private async handleHelp(
    ctx: Context,
    userRef: TelegramUserRef | null,
    updateMeta: UpdateMeta,
  ): Promise<void> {
    this.logger.debug(
      `Handle /help telegramId=${userRef?.telegramId ?? 'unknown'} username=${userRef?.username ?? 'n/a'} updateId=${updateMeta.updateId ?? 'n/a'}`,
    );

    await this.replyWithLog(
      ctx,
      [
        'Использование:',
        '/track <address> [label] - добавить адрес',
        '/list - показать отслеживаемые адреса',
        '/untrack <address|id> - удалить адрес',
      ].join('\n'),
      updateMeta,
    );
  }

  private async handleTrack(
    ctx: Context,
    userRef: TelegramUserRef | null,
    updateMeta: UpdateMeta,
    args: readonly string[],
  ): Promise<void> {
    const address: string | null = args[0] ?? null;
    const label: string | null = args.length > 1 ? args.slice(1).join(' ') : null;

    if (!address) {
      this.logger.debug(
        `Track command rejected: missing address argument updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      await this.replyWithLog(ctx, 'Передай адрес: /track <address> [label]', updateMeta);
      return;
    }

    if (!userRef) {
      this.logger.warn(
        `Track command rejected: user context is missing updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      await this.replyWithLog(ctx, 'Не удалось определить пользователя.', updateMeta);
      return;
    }

    try {
      await this.runSequentialForUser(userRef.telegramId, async (): Promise<void> => {
        const responseMessage: string = await this.trackingService.trackAddress(
          userRef,
          address,
          label,
        );
        this.logger.log(
          `Track command success for telegramId=${userRef.telegramId} address=${address} updateId=${updateMeta.updateId ?? 'n/a'}`,
        );
        await this.replyWithLog(ctx, responseMessage, updateMeta);
      });
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Track command failed: ${errorMessage}`);
      await this.replyWithLog(ctx, `Не удалось добавить адрес: ${errorMessage}`, updateMeta);
    }
  }

  private async handleList(
    ctx: Context,
    userRef: TelegramUserRef | null,
    updateMeta: UpdateMeta,
  ): Promise<void> {
    if (!userRef) {
      this.logger.warn(
        `List command rejected: user context is missing updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      await this.replyWithLog(ctx, 'Не удалось определить пользователя.', updateMeta);
      return;
    }

    try {
      await this.runSequentialForUser(userRef.telegramId, async (): Promise<void> => {
        const responseMessage: string = await this.trackingService.listTrackedAddresses(userRef);
        this.logger.debug(
          `List command success for telegramId=${userRef.telegramId} updateId=${updateMeta.updateId ?? 'n/a'}`,
        );
        await this.replyWithLog(ctx, responseMessage, updateMeta);
      });
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`List command failed: ${errorMessage}`);
      await this.replyWithLog(ctx, `Не удалось получить список: ${errorMessage}`, updateMeta);
    }
  }

  private async handleUntrack(
    ctx: Context,
    userRef: TelegramUserRef | null,
    updateMeta: UpdateMeta,
    args: readonly string[],
  ): Promise<void> {
    const rawIdentifier: string | null = args[0] ?? null;

    if (!rawIdentifier) {
      this.logger.debug(
        `Untrack command rejected: missing id/address argument updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      await this.replyWithLog(ctx, 'Передай id или адрес: /untrack <address|id>', updateMeta);
      return;
    }

    if (!userRef) {
      this.logger.warn(
        `Untrack command rejected: user context is missing updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      await this.replyWithLog(ctx, 'Не удалось определить пользователя.', updateMeta);
      return;
    }

    try {
      await this.runSequentialForUser(userRef.telegramId, async (): Promise<void> => {
        const responseMessage: string = await this.trackingService.untrackAddress(
          userRef,
          rawIdentifier,
        );
        this.logger.log(
          `Untrack command success for telegramId=${userRef.telegramId} identifier=${rawIdentifier} updateId=${updateMeta.updateId ?? 'n/a'}`,
        );
        await this.replyWithLog(ctx, responseMessage, updateMeta);
      });
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Untrack command failed: ${errorMessage}`);
      await this.replyWithLog(ctx, `Не удалось удалить адрес: ${errorMessage}`, updateMeta);
    }
  }

  private async runSequentialForUser(telegramId: string, task: () => Promise<void>): Promise<void> {
    const previousTask: Promise<void> = this.userCommandQueue.get(telegramId) ?? Promise.resolve();

    const nextTask: Promise<void> = previousTask
      .catch((): void => undefined)
      .then(async (): Promise<void> => {
        this.logger.debug(`Command queue start telegramId=${telegramId}`);
        await task();
      })
      .finally((): void => {
        if (this.userCommandQueue.get(telegramId) === nextTask) {
          this.userCommandQueue.delete(telegramId);
        }
        this.logger.debug(`Command queue finish telegramId=${telegramId}`);
      });

    this.userCommandQueue.set(telegramId, nextTask);
    await nextTask;
  }

  private getUserRef(ctx: Context): TelegramUserRef | null {
    if (!ctx.from) {
      return null;
    }

    return {
      telegramId: String(ctx.from.id),
      username: ctx.from.username ?? null,
    };
  }

  private getText(ctx: Context): string | null {
    const message = ctx.message;

    if (!message || !('text' in message)) {
      return null;
    }

    return message.text;
  }

  private parseTextCommand(rawText: string): ParsedTextCommand {
    const trimmedText: string = rawText.trim();

    if (!trimmedText.startsWith('/')) {
      return {
        command: null,
        args: [],
        rawText,
      };
    }

    const parts: string[] = trimmedText.split(/\s+/);
    const commandToken: string | undefined = parts[0];

    if (!commandToken) {
      return {
        command: null,
        args: [],
        rawText,
      };
    }

    const commandWithMention: string = commandToken.slice(1);
    const commandBase: string | undefined = commandWithMention.split('@')[0];

    if (!commandBase) {
      return {
        command: null,
        args: [],
        rawText,
      };
    }

    const commandName: string = commandBase.toLowerCase();
    const args: readonly string[] = parts.slice(1);
    const command: SupportedTelegramCommand | null = this.resolveSupportedCommand(commandName);

    return {
      command,
      args,
      rawText,
    };
  }

  private resolveSupportedCommand(commandName: string): SupportedTelegramCommand | null {
    return SUPPORTED_COMMAND_MAP[commandName] ?? null;
  }

  private getUpdateMeta(ctx: Context): UpdateMeta {
    const chatId: string | null =
      'chat' in ctx && ctx.chat && 'id' in ctx.chat ? String(ctx.chat.id) : null;

    const messageId: number | null =
      ctx.message && 'message_id' in ctx.message ? ctx.message.message_id : null;

    const updateId: number = ctx.update.update_id;

    return {
      updateId,
      chatId,
      messageId,
    };
  }

  private async replyWithLog(ctx: Context, text: string, updateMeta: UpdateMeta): Promise<void> {
    this.logger.debug(
      `Reply start updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} messageId=${updateMeta.messageId ?? 'n/a'} textLength=${text.length.toString()}`,
    );

    try {
      const sentMessage: Message.TextMessage = await ctx.reply(text);
      this.logger.log(
        `Reply success updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} responseMessageId=${sentMessage.message_id}`,
      );
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Reply failed updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} reason=${errorMessage}`,
      );
      throw error;
    }
  }
}
