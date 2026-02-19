import { Logger } from '@nestjs/common';
import { Ctx, On, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';
import type { Message } from 'telegraf/typings/core/types/typegram';

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
import { TelegramUiService } from './telegram-ui.service';
import { USER_NOT_IDENTIFIED_MESSAGE } from './telegram.constants';
import {
  type CommandExecutionResult,
  type ParsedMessageCommand,
  type ReplyOptions,
  type UpdateMeta,
  type WalletCallbackTarget,
} from './telegram.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import type { RuntimeStatusService } from '../../../runtime/runtime-status.service';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import type { TrackingService } from '../../whales/services/tracking.service';

@Update()
export class TelegramUpdate {
  private readonly logger: Logger = new Logger(TelegramUpdate.name);
  private readonly userCommandQueue: Map<string, Promise<void>> = new Map<string, Promise<void>>();
  private readonly parserService: TelegramParserService;
  private readonly callbackParserService: TelegramCallbackParserService;
  private readonly commandOrchestratorService: TelegramCommandOrchestratorService;
  private readonly uiService: TelegramUiService;

  public constructor(
    parserService: TelegramParserService,
    callbackParserService: TelegramCallbackParserService,
    commandOrchestratorService: TelegramCommandOrchestratorService,
    uiService: TelegramUiService,
  ) {
    this.parserService = parserService;
    this.callbackParserService = callbackParserService;
    this.commandOrchestratorService = commandOrchestratorService;
    this.uiService = uiService;
  }

  public static createForTesting(
    trackingService: TrackingService,
    runtimeStatusService: RuntimeStatusService,
    appConfigService: AppConfigService,
  ): TelegramUpdate {
    const parserService: TelegramParserService = new TelegramParserService();
    const callbackParserService: TelegramCallbackParserService =
      new TelegramCallbackParserService();
    const uiService: TelegramUiService = new TelegramUiService();

    const basicDeps = new TelegramBasicCommandsServiceDependencies();
    (basicDeps as { trackingService: TrackingService }).trackingService = trackingService;
    (basicDeps as { runtimeStatusService: RuntimeStatusService }).runtimeStatusService =
      runtimeStatusService;
    (basicDeps as { appConfigService: AppConfigService }).appConfigService = appConfigService;
    (basicDeps as { parserService: TelegramParserService }).parserService = parserService;
    (basicDeps as { uiService: TelegramUiService }).uiService = uiService;

    const filterDeps = new TelegramFilterCommandsServiceDependencies();
    (filterDeps as { trackingService: TrackingService }).trackingService = trackingService;
    (filterDeps as { parserService: TelegramParserService }).parserService = parserService;
    (filterDeps as { uiService: TelegramUiService }).uiService = uiService;

    const callbackDeps = new TelegramCallbackCommandsServiceDependencies();
    (callbackDeps as { trackingService: TrackingService }).trackingService = trackingService;
    (callbackDeps as { uiService: TelegramUiService }).uiService = uiService;

    const basicCommandsService: TelegramBasicCommandsService = new TelegramBasicCommandsService(
      basicDeps,
    );
    const filterCommandsService: TelegramFilterCommandsService = new TelegramFilterCommandsService(
      filterDeps,
    );
    const callbackCommandsService: TelegramCallbackCommandsService =
      new TelegramCallbackCommandsService(callbackDeps);
    const commandOrchestratorService: TelegramCommandOrchestratorService =
      new TelegramCommandOrchestratorService(
        basicCommandsService,
        filterCommandsService,
        callbackCommandsService,
      );

    return new TelegramUpdate(
      parserService,
      callbackParserService,
      commandOrchestratorService,
      uiService,
    );
  }

  @On('text')
  public async onText(@Ctx() ctx: Context): Promise<void> {
    const text: string | null = this.getText(ctx);
    const userRef: TelegramUserRef | null = this.getUserRef(ctx);
    const updateMeta: UpdateMeta = this.getUpdateMeta(ctx);

    if (text === null) {
      this.logger.debug(
        `Incoming text update without message text updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return;
    }

    const parsedCommands = this.parserService.parseMessageCommands(text);

    if (parsedCommands.length === 0) {
      this.logger.debug(
        `Ignore non-command text updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} messageId=${updateMeta.messageId ?? 'n/a'} text="${text}"`,
      );
      return;
    }

    try {
      const results: readonly CommandExecutionResult[] =
        userRef !== null
          ? await this.runSequentialForUser(
              userRef.telegramId,
              async (): Promise<readonly CommandExecutionResult[]> =>
                this.commandOrchestratorService.executeParsedCommands(
                  parsedCommands,
                  userRef,
                  updateMeta,
                ),
            )
          : await this.commandOrchestratorService.executeParsedCommands(
              parsedCommands,
              userRef,
              updateMeta,
            );

      await this.replyWithLog(
        ctx,
        this.uiService.formatExecutionResults(results),
        updateMeta,
        this.uiService.resolveReplyOptions(results),
      );
    } catch (error: unknown) {
      await this.replyError(ctx, updateMeta, error, 'Command batch failed');
    }
  }

  @On('callback_query')
  public async onCallbackQuery(@Ctx() ctx: Context): Promise<void> {
    const userRef: TelegramUserRef | null = this.getUserRef(ctx);
    const updateMeta: UpdateMeta = this.getUpdateMeta(ctx);
    const callbackData: string | null = this.getCallbackData(ctx);

    if (callbackData === null) {
      await this.answerCallbackSafe(ctx, 'Действие не поддерживается.');
      return;
    }

    const callbackTarget: WalletCallbackTarget | null =
      this.callbackParserService.parseWalletCallbackData(callbackData);

    if (callbackTarget === null) {
      await this.answerCallbackSafe(ctx, 'Неизвестное действие.');
      return;
    }

    if (userRef === null) {
      await this.answerCallbackSafe(ctx, USER_NOT_IDENTIFIED_MESSAGE);
      return;
    }

    await this.answerCallbackSafe(ctx, 'Выполняю действие...');

    try {
      const response: CommandExecutionResult =
        await this.commandOrchestratorService.executeWalletCallbackAction(userRef, callbackTarget);
      await this.replyWithLog(ctx, response.message, updateMeta, response.replyOptions);
    } catch (error: unknown) {
      await this.replyError(ctx, updateMeta, error, `Callback action failed: ${callbackData}`);
    }
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
    return this.parserService.parseMessageCommands(rawText);
  }

  private parseWalletCallbackData(callbackData: string): WalletCallbackTarget | null {
    return this.callbackParserService.parseWalletCallbackData(callbackData);
  }

  private getCallbackData(ctx: Context): string | null {
    const callbackQuery = ctx.callbackQuery;

    if (!callbackQuery || !('data' in callbackQuery)) {
      return null;
    }

    return typeof callbackQuery.data === 'string' ? callbackQuery.data : null;
  }

  private getUpdateMeta(ctx: Context): UpdateMeta {
    const chatId: string | null =
      'chat' in ctx && ctx.chat && 'id' in ctx.chat ? String(ctx.chat.id) : null;
    const messageId: number | null =
      ctx.message && 'message_id' in ctx.message ? ctx.message.message_id : null;

    return {
      updateId: ctx.update.update_id,
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

    const sentMessage: Message.TextMessage = await this.sendReply(
      ctx,
      text,
      replyOptions ?? this.uiService.buildReplyOptions(),
    );

    this.logger.log(
      `Reply success updateId=${updateMeta.updateId ?? 'n/a'} chatId=${updateMeta.chatId ?? 'n/a'} responseMessageId=${sentMessage.message_id}`,
    );
  }

  private async sendReply(
    ctx: Context,
    text: string,
    replyOptions: ReplyOptions,
  ): Promise<Message.TextMessage> {
    try {
      return await ctx.reply(text, replyOptions);
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reply failed reason=${errorMessage}`);
      throw error;
    }
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

  private async replyError(
    ctx: Context,
    updateMeta: UpdateMeta,
    error: unknown,
    logPrefix: string,
  ): Promise<void> {
    const errorMessage: string = error instanceof Error ? error.message : String(error);
    this.logger.warn(`${logPrefix}: ${errorMessage}`);
    await this.replyWithLog(ctx, `Ошибка обработки команд: ${errorMessage}`, updateMeta);
  }
}
