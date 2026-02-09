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

type ParsedMessageCommand = {
  readonly command: SupportedTelegramCommand;
  readonly args: readonly string[];
  readonly lineNumber: number;
};

type CommandExecutionResult = {
  readonly lineNumber: number;
  readonly message: string;
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

    const parsedCommands: readonly ParsedMessageCommand[] = this.parseMessageCommands(text);

    if (parsedCommands.length === 0) {
      this.logger.debug(
        `Ignore non-command text updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} messageId=${updateMeta.messageId ?? 'n/a'} text="${text}"`,
      );
      return;
    }

    this.logger.log(
      `Incoming commands count=${parsedCommands.length} updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} messageId=${updateMeta.messageId ?? 'n/a'} telegramId=${userRef?.telegramId ?? 'unknown'}`,
    );

    try {
      const results: readonly CommandExecutionResult[] =
        userRef !== null
          ? await this.runSequentialForUser(
              userRef.telegramId,
              async (): Promise<readonly CommandExecutionResult[]> =>
                this.executeParsedCommands(parsedCommands, userRef, updateMeta),
            )
          : await this.executeParsedCommands(parsedCommands, userRef, updateMeta);

      const replyText: string = this.formatExecutionResults(results);
      await this.replyWithLog(ctx, replyText, updateMeta);
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Command batch failed: ${errorMessage}`);
      await this.replyWithLog(ctx, `Ошибка обработки команд: ${errorMessage}`, updateMeta);
    }
  }

  private async executeParsedCommands(
    commands: readonly ParsedMessageCommand[],
    userRef: TelegramUserRef | null,
    updateMeta: UpdateMeta,
  ): Promise<readonly CommandExecutionResult[]> {
    const results: CommandExecutionResult[] = [];

    for (const commandEntry of commands) {
      let message: string;

      switch (commandEntry.command) {
        case SupportedTelegramCommand.START:
          this.logger.log(
            `Handle /start line=${commandEntry.lineNumber} telegramId=${userRef?.telegramId ?? 'unknown'} updateId=${updateMeta.updateId ?? 'n/a'}`,
          );
          message = this.buildStartMessage();
          break;
        case SupportedTelegramCommand.HELP:
          this.logger.debug(
            `Handle /help line=${commandEntry.lineNumber} telegramId=${userRef?.telegramId ?? 'unknown'} updateId=${updateMeta.updateId ?? 'n/a'}`,
          );
          message = this.buildHelpMessage();
          break;
        case SupportedTelegramCommand.TRACK:
          message = await this.executeTrackCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.LIST:
          message = await this.executeListCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.UNTRACK:
          message = await this.executeUntrackCommand(userRef, commandEntry, updateMeta);
          break;
        default:
          message = 'Неизвестная команда. Используй /help.';
      }

      results.push({
        lineNumber: commandEntry.lineNumber,
        message,
      });
    }

    return results;
  }

  private async executeTrackCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    const address: string | null = commandEntry.args[0] ?? null;
    const labelRaw: string | null =
      commandEntry.args.length > 1 ? commandEntry.args.slice(1).join(' ') : null;
    const label: string | null = labelRaw && labelRaw.trim().length > 0 ? labelRaw.trim() : null;

    if (!address) {
      this.logger.debug(
        `Track command rejected: missing address line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Передай адрес: /track <address> [label]';
    }

    if (!userRef) {
      this.logger.warn(
        `Track command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const responseMessage: string = await this.trackingService.trackAddress(
      userRef,
      address,
      label,
    );
    this.logger.log(
      `Track command success line=${commandEntry.lineNumber} telegramId=${userRef.telegramId} address=${address} updateId=${updateMeta.updateId ?? 'n/a'}`,
    );

    return responseMessage;
  }

  private async executeListCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (!userRef) {
      this.logger.warn(
        `List command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const responseMessage: string = await this.trackingService.listTrackedAddresses(userRef);
    this.logger.debug(
      `List command success line=${commandEntry.lineNumber} telegramId=${userRef.telegramId} updateId=${updateMeta.updateId ?? 'n/a'}`,
    );

    return responseMessage;
  }

  private async executeUntrackCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    const rawIdentifier: string | null = commandEntry.args[0] ?? null;

    if (!rawIdentifier) {
      this.logger.debug(
        `Untrack command rejected: missing id/address line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Передай id или адрес: /untrack <address|id>';
    }

    if (!userRef) {
      this.logger.warn(
        `Untrack command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const responseMessage: string = await this.trackingService.untrackAddress(
      userRef,
      rawIdentifier,
    );
    this.logger.log(
      `Untrack command success line=${commandEntry.lineNumber} telegramId=${userRef.telegramId} identifier=${rawIdentifier} updateId=${updateMeta.updateId ?? 'n/a'}`,
    );

    return responseMessage;
  }

  private buildStartMessage(): string {
    return [
      'Привет. Я отслеживаю активность китов в Ethereum.',
      'Команды:',
      '/track <address> [label]',
      '/list',
      '/untrack <address|id>',
      '/help',
    ].join('\n');
  }

  private buildHelpMessage(): string {
    return [
      'Использование:',
      '/track <address> [label] - добавить адрес',
      '/list - показать отслеживаемые адреса',
      '/untrack <address|id> - удалить адрес',
    ].join('\n');
  }

  private formatExecutionResults(results: readonly CommandExecutionResult[]): string {
    if (results.length === 1) {
      const singleResult: CommandExecutionResult | undefined = results[0];

      if (!singleResult) {
        return 'Команда не распознана.';
      }

      return singleResult.message;
    }

    return results
      .map(
        (result: CommandExecutionResult): string =>
          `Строка ${result.lineNumber}: ${result.message}`,
      )
      .join('\n');
  }

  private async runSequentialForUser<T>(telegramId: string, task: () => Promise<T>): Promise<T> {
    const previousTask: Promise<void> = this.userCommandQueue.get(telegramId) ?? Promise.resolve();

    const taskPromise: Promise<T> = previousTask
      .catch((): void => undefined)
      .then(async (): Promise<T> => {
        this.logger.debug(`Command queue start telegramId=${telegramId}`);
        return task();
      });

    const queuePromise: Promise<void> = taskPromise
      .then((): void => undefined)
      .catch((): void => undefined)
      .finally((): void => {
        if (this.userCommandQueue.get(telegramId) === queuePromise) {
          this.userCommandQueue.delete(telegramId);
        }
        this.logger.debug(`Command queue finish telegramId=${telegramId}`);
      });

    this.userCommandQueue.set(telegramId, queuePromise);
    return taskPromise;
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

  private parseMessageCommands(rawText: string): readonly ParsedMessageCommand[] {
    const lines: readonly string[] = rawText.split(/\r?\n/);
    const parsedCommands: ParsedMessageCommand[] = [];

    for (let lineIndex: number = 0; lineIndex < lines.length; lineIndex += 1) {
      const rawLine: string = lines[lineIndex]?.trim() ?? '';

      if (rawLine.length === 0 || !rawLine.startsWith('/')) {
        continue;
      }

      const parts: readonly string[] = rawLine.split(/\s+/);
      const commandToken: string | undefined = parts[0];

      if (!commandToken) {
        continue;
      }

      const commandWithMention: string = commandToken.slice(1);
      const commandBase: string | undefined = commandWithMention.split('@')[0];

      if (!commandBase) {
        continue;
      }

      const commandName: string = commandBase.toLowerCase();
      const command: SupportedTelegramCommand | null = this.resolveSupportedCommand(commandName);

      if (!command) {
        continue;
      }

      const commandLineNumber: number = lineIndex + 1;
      let args: readonly string[] = parts.slice(1);

      if (command === SupportedTelegramCommand.TRACK && args.length === 1) {
        const nextLine: string | undefined = lines[lineIndex + 1];
        const nextTrimmedLine: string = nextLine?.trim() ?? '';
        const currentAddressArg: string | undefined = args[0];

        if (currentAddressArg && nextTrimmedLine.length > 0 && !nextTrimmedLine.startsWith('/')) {
          args = [currentAddressArg, nextTrimmedLine];
          lineIndex += 1;
        }
      }

      parsedCommands.push({
        command,
        args,
        lineNumber: commandLineNumber,
      });
    }

    return parsedCommands;
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
