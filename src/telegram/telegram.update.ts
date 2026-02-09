import { Logger } from '@nestjs/common';
import { Ctx, On, Update } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import type { Context } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import type { Message } from 'telegraf/typings/core/types/typegram';

import {
  SupportedTelegramCommand,
  type CommandExecutionResult,
  type ParsedMessageCommand,
  type ReplyOptions,
  type UpdateMeta,
  type WalletHistoryCallbackTarget,
} from './telegram.interfaces';
import type { TelegramUserRef, TrackedWalletOption } from '../tracking/tracking.interfaces';
import { TrackingService } from '../tracking/tracking.service';

const SUPPORTED_COMMAND_MAP: Readonly<Record<string, SupportedTelegramCommand>> = {
  start: SupportedTelegramCommand.START,
  help: SupportedTelegramCommand.HELP,
  track: SupportedTelegramCommand.TRACK,
  list: SupportedTelegramCommand.LIST,
  untrack: SupportedTelegramCommand.UNTRACK,
  history: SupportedTelegramCommand.HISTORY,
};

const MENU_BUTTON_COMMAND_MAP: Readonly<Record<string, SupportedTelegramCommand>> = {
  '🏠 Главное меню': SupportedTelegramCommand.START,
  '➕ Добавить адрес': SupportedTelegramCommand.TRACK_HINT,
  '📋 Мой список': SupportedTelegramCommand.LIST,
  '📜 История': SupportedTelegramCommand.HISTORY_HINT,
  '🗑 Удалить адрес': SupportedTelegramCommand.UNTRACK_HINT,
  '❓ Помощь': SupportedTelegramCommand.HELP,
};

const WALLET_HISTORY_CALLBACK_PREFIX: string = 'wallet_history:';
const WALLET_HISTORY_ADDR_CALLBACK_PREFIX: string = 'wallet_history_addr:';
const CALLBACK_HISTORY_LIMIT: string = '10';

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
      await this.replyWithLog(ctx, replyText, updateMeta, this.resolveReplyOptions(results));
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Command batch failed: ${errorMessage}`);
      await this.replyWithLog(ctx, `Ошибка обработки команд: ${errorMessage}`, updateMeta);
    }
  }

  @On('callback_query')
  public async onCallbackQuery(@Ctx() ctx: Context): Promise<void> {
    const userRef: TelegramUserRef | null = this.getUserRef(ctx);
    const updateMeta: UpdateMeta = this.getUpdateMeta(ctx);
    const callbackData: string | null = this.getCallbackData(ctx);

    if (!callbackData) {
      await this.answerCallbackSafe(ctx, 'Действие не поддерживается.');
      return;
    }

    const callbackTarget: WalletHistoryCallbackTarget | null =
      this.parseWalletHistoryCallbackData(callbackData);

    if (callbackTarget === null) {
      await this.answerCallbackSafe(ctx, 'Неизвестное действие.');
      return;
    }

    if (!userRef) {
      await this.answerCallbackSafe(ctx, 'Не удалось определить пользователя.');
      return;
    }

    await this.answerCallbackSafe(ctx, 'Загружаю историю...');

    try {
      const historyMessage: string =
        callbackTarget.targetType === 'address'
          ? await this.trackingService.getAddressHistory(
              userRef,
              callbackTarget.walletAddress,
              CALLBACK_HISTORY_LIMIT,
            )
          : await this.trackingService.getAddressHistory(
              userRef,
              `#${callbackTarget.walletId}`,
              CALLBACK_HISTORY_LIMIT,
            );
      await this.replyWithLog(ctx, historyMessage, updateMeta, this.buildHistoryReplyOptions());
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Callback history failed: callbackData=${callbackData} reason=${errorMessage}`,
      );
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
      let replyOptions: ReplyOptions | null = null;

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
          {
            const listResult: CommandExecutionResult = await this.executeListCommand(
              userRef,
              commandEntry,
              updateMeta,
            );
            message = listResult.message;
            replyOptions = listResult.replyOptions;
          }
          break;
        case SupportedTelegramCommand.UNTRACK:
          message = await this.executeUntrackCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.HISTORY:
          message = await this.executeHistoryCommand(userRef, commandEntry, updateMeta);
          replyOptions = this.buildHistoryReplyOptions();
          break;
        case SupportedTelegramCommand.TRACK_HINT:
          message = this.buildTrackHintMessage();
          break;
        case SupportedTelegramCommand.HISTORY_HINT:
          message = this.buildHistoryHintMessage();
          break;
        case SupportedTelegramCommand.UNTRACK_HINT:
          message = this.buildUntrackHintMessage();
          break;
        default:
          message = 'Неизвестная команда. Используй /help.';
      }

      results.push({
        lineNumber: commandEntry.lineNumber,
        message,
        replyOptions,
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
      return [
        'Передай адрес для отслеживания.',
        'Формат: /track <address> [label]',
        'Пример: /track 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
      ].join('\n');
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
  ): Promise<CommandExecutionResult> {
    if (!userRef) {
      this.logger.warn(
        `List command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: 'Не удалось определить пользователя.',
        replyOptions: null,
      };
    }

    const responseMessage: string = await this.trackingService.listTrackedAddresses(userRef);
    const walletOptions: readonly TrackedWalletOption[] =
      await this.trackingService.listTrackedWalletOptions(userRef);
    this.logger.debug(
      `List command success line=${commandEntry.lineNumber} telegramId=${userRef.telegramId} updateId=${updateMeta.updateId ?? 'n/a'}`,
    );

    return {
      lineNumber: commandEntry.lineNumber,
      message: responseMessage,
      replyOptions:
        walletOptions.length > 0 ? this.buildWalletHistoryInlineKeyboard(walletOptions) : null,
    };
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
      return [
        'Передай id или адрес для удаления.',
        'Формат: /untrack <address|id>',
        'Пример: /untrack #3',
      ].join('\n');
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

  private async executeHistoryCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    const rawAddress: string | null = commandEntry.args[0] ?? null;
    const rawLimit: string | null = commandEntry.args[1] ?? null;

    if (!rawAddress) {
      this.logger.debug(
        `History command rejected: missing address line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return [
        'Передай адрес или id из /list.',
        'Формат: /history <address|#id> [limit]',
        'Примеры:',
        '/history #3 10',
        '/history 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 5',
      ].join('\n');
    }

    if (!userRef) {
      this.logger.warn(
        `History command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const responseMessage: string = await this.trackingService.getAddressHistory(
      userRef,
      rawAddress,
      rawLimit,
    );
    this.logger.log(
      `History command success line=${commandEntry.lineNumber} telegramId=${userRef.telegramId} address=${rawAddress} limit=${rawLimit ?? 'default'} updateId=${updateMeta.updateId ?? 'n/a'}`,
    );

    return responseMessage;
  }

  private buildStartMessage(): string {
    return [
      'Whale Alert Bot готов к работе.',
      'Ниже есть меню-кнопки для быстрых действий.',
      '',
      'Что умею:',
      '1. Добавлять адреса в отслеживание.',
      '2. Показывать список с id для быстрых команд.',
      '3. Показывать последние транзакции через Etherscan.',
      '',
      'Быстрый старт:',
      '/track <address> [label]',
      '/list',
      '/history <address|#id> [limit]',
      '',
      'Можно отправлять несколько команд одним сообщением, по одной на строку.',
      'Подробности: /help',
    ].join('\n');
  }

  private buildHelpMessage(): string {
    return [
      'Команды:',
      '/track <address> [label] - добавить адрес',
      '/list - показать список адресов и их id',
      '/untrack <address|id> - удалить адрес',
      '/history <address|#id> [limit] - последние транзакции',
      '',
      'Примеры:',
      '/track 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
      '/history #1 10',
      '/untrack #1',
      '',
      'Подсказка по адресу:',
      'если checksum mixed-case вызывает ошибку, вставь адрес целиком в lower-case.',
      '',
      'Можно пользоваться кнопками меню под полем ввода.',
    ].join('\n');
  }

  private buildTrackHintMessage(): string {
    return [
      'Добавление адреса:',
      '/track <address> [label]',
      'Пример:',
      '/track 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
    ].join('\n');
  }

  private buildHistoryHintMessage(): string {
    return [
      'История транзакций:',
      '/history <address|#id> [limit]',
      'Примеры:',
      '/history #1 10',
      '/history 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 5',
    ].join('\n');
  }

  private buildUntrackHintMessage(): string {
    return ['Удаление адреса:', '/untrack <address|id>', 'Пример:', '/untrack #1'].join('\n');
  }

  private formatExecutionResults(results: readonly CommandExecutionResult[]): string {
    if (results.length === 1) {
      const singleResult: CommandExecutionResult | undefined = results[0];

      if (!singleResult) {
        return 'Команда не распознана.';
      }

      return singleResult.message;
    }

    const rowMessages: readonly string[] = results.map(
      (result: CommandExecutionResult, index: number): string =>
        [`${index + 1}. Строка ${result.lineNumber}:`, result.message].join('\n'),
    );

    return [`Обработано команд: ${results.length}`, ...rowMessages].join('\n\n');
  }

  private resolveReplyOptions(results: readonly CommandExecutionResult[]): ReplyOptions | null {
    if (results.length === 1) {
      const onlyResult: CommandExecutionResult | undefined = results[0];

      if (onlyResult?.replyOptions) {
        return onlyResult.replyOptions;
      }
    }

    return null;
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

      if (rawLine.length === 0) {
        continue;
      }

      const menuCommand: SupportedTelegramCommand | null = this.resolveMenuButtonCommand(rawLine);

      if (menuCommand) {
        parsedCommands.push({
          command: menuCommand,
          args: [],
          lineNumber: lineIndex + 1,
        });
        continue;
      }

      if (!rawLine.startsWith('/')) {
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

  private resolveMenuButtonCommand(buttonText: string): SupportedTelegramCommand | null {
    return MENU_BUTTON_COMMAND_MAP[buttonText] ?? null;
  }

  private getCallbackData(ctx: Context): string | null {
    const callbackQuery = ctx.callbackQuery;

    if (!callbackQuery || !('data' in callbackQuery)) {
      return null;
    }

    return typeof callbackQuery.data === 'string' ? callbackQuery.data : null;
  }

  private parseWalletHistoryCallbackData(callbackData: string): WalletHistoryCallbackTarget | null {
    if (callbackData.startsWith(WALLET_HISTORY_ADDR_CALLBACK_PREFIX)) {
      const rawAddress: string = callbackData.slice(WALLET_HISTORY_ADDR_CALLBACK_PREFIX.length);

      if (!/^0x[a-fA-F0-9]{40}$/.test(rawAddress)) {
        return null;
      }

      return {
        targetType: 'address',
        walletAddress: rawAddress,
      };
    }

    if (!callbackData.startsWith(WALLET_HISTORY_CALLBACK_PREFIX)) {
      return null;
    }

    const rawWalletId: string = callbackData.slice(WALLET_HISTORY_CALLBACK_PREFIX.length);

    if (!/^\d+$/.test(rawWalletId)) {
      return null;
    }

    return {
      targetType: 'wallet_id',
      walletId: Number.parseInt(rawWalletId, 10),
    };
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

  private async replyWithLog(
    ctx: Context,
    text: string,
    updateMeta: UpdateMeta,
    replyOptions: ReplyOptions | null = null,
  ): Promise<void> {
    this.logger.debug(
      `Reply start updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} messageId=${updateMeta.messageId ?? 'n/a'} textLength=${text.length.toString()}`,
    );

    try {
      const sentMessage: Message.TextMessage = await ctx.reply(
        text,
        replyOptions ?? this.buildReplyOptions(),
      );
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

  private buildReplyOptions(): ReplyOptions {
    return Markup.keyboard([
      ['🏠 Главное меню', '📋 Мой список'],
      ['➕ Добавить адрес', '📜 История'],
      ['🗑 Удалить адрес', '❓ Помощь'],
    ])
      .resize()
      .persistent();
  }

  private buildHistoryReplyOptions(): ReplyOptions {
    return {
      ...this.buildReplyOptions(),
      parse_mode: 'HTML',
      link_preview_options: {
        is_disabled: true,
      },
    };
  }

  private async answerCallbackSafe(ctx: Context, text: string): Promise<void> {
    if (!ctx.callbackQuery) {
      return;
    }

    try {
      await ctx.answerCbQuery(text);
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`answerCbQuery failed: ${errorMessage}`);
    }
  }

  private buildWalletHistoryInlineKeyboard(
    walletOptions: readonly TrackedWalletOption[],
  ): ReplyOptions {
    const rows: InlineKeyboardButton.CallbackButton[][] = walletOptions.map(
      (wallet): InlineKeyboardButton.CallbackButton[] => [
        {
          text: this.buildWalletHistoryButtonText(wallet),
          callback_data: `${WALLET_HISTORY_ADDR_CALLBACK_PREFIX}${wallet.walletAddress}`,
        },
      ],
    );

    return Markup.inlineKeyboard(rows);
  }

  private buildWalletHistoryButtonText(wallet: TrackedWalletOption): string {
    const titleSource: string = wallet.walletLabel ?? this.shortAddress(wallet.walletAddress);
    const normalizedTitle: string = titleSource.trim();
    const title: string =
      normalizedTitle.length > 24 ? `${normalizedTitle.slice(0, 21)}...` : normalizedTitle;

    return `📜 #${wallet.walletId} ${title}`;
  }

  private shortAddress(address: string): string {
    const prefix: string = address.slice(0, 8);
    const suffix: string = address.slice(-6);
    return `${prefix}...${suffix}`;
  }
}
