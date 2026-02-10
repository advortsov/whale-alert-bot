import { Logger } from '@nestjs/common';
import { Ctx, On, Update } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import type { Context } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import type { Message } from 'telegraf/typings/core/types/typegram';

import {
  SupportedTelegramCommand,
  WalletCallbackAction,
  WalletCallbackFilterTarget,
  type CommandExecutionResult,
  type ParsedMessageCommand,
  type ReplyOptions,
  type UpdateMeta,
  type WalletCallbackTarget,
} from './telegram.interfaces';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';
import { RuntimeStatusService } from '../runtime/runtime-status.service';
import type { HistoryPageResult } from '../tracking/history-page.interfaces';
import { HistoryRequestSource } from '../tracking/history-rate-limiter.interfaces';
import {
  AlertFilterToggleTarget,
  type TelegramUserRef,
  type TrackedWalletOption,
  type WalletAlertFilterState,
} from '../tracking/tracking.interfaces';
import { TrackingService } from '../tracking/tracking.service';

const SUPPORTED_COMMAND_MAP: Readonly<Record<string, SupportedTelegramCommand>> = {
  start: SupportedTelegramCommand.START,
  help: SupportedTelegramCommand.HELP,
  track: SupportedTelegramCommand.TRACK,
  list: SupportedTelegramCommand.LIST,
  untrack: SupportedTelegramCommand.UNTRACK,
  history: SupportedTelegramCommand.HISTORY,
  wallet: SupportedTelegramCommand.WALLET,
  status: SupportedTelegramCommand.STATUS,
  filter: SupportedTelegramCommand.FILTER,
  threshold: SupportedTelegramCommand.THRESHOLD,
  filters: SupportedTelegramCommand.FILTERS,
  walletfilters: SupportedTelegramCommand.WALLET_FILTERS,
  wfilter: SupportedTelegramCommand.WALLET_FILTER,
  quiet: SupportedTelegramCommand.QUIET,
  tz: SupportedTelegramCommand.TZ,
  mute: SupportedTelegramCommand.MUTE,
};

const MENU_BUTTON_COMMAND_MAP: Readonly<Record<string, SupportedTelegramCommand>> = {
  '🏠 Главное меню': SupportedTelegramCommand.START,
  '➕ Добавить адрес': SupportedTelegramCommand.TRACK_HINT,
  '📋 Мой список': SupportedTelegramCommand.LIST,
  '📈 Статус': SupportedTelegramCommand.STATUS,
  '📜 История': SupportedTelegramCommand.HISTORY_HINT,
  '⚙️ Фильтры': SupportedTelegramCommand.FILTERS,
  '🗑 Удалить адрес': SupportedTelegramCommand.UNTRACK_HINT,
  '❓ Помощь': SupportedTelegramCommand.HELP,
};

const ALERT_FILTER_TARGET_MAP: Readonly<Record<string, AlertFilterToggleTarget>> = {
  transfer: AlertFilterToggleTarget.TRANSFER,
  swap: AlertFilterToggleTarget.SWAP,
};

const TRACK_CHAIN_ALIAS_MAP: Readonly<Record<string, ChainKey>> = {
  eth: ChainKey.ETHEREUM_MAINNET,
  ethereum: ChainKey.ETHEREUM_MAINNET,
  sol: ChainKey.SOLANA_MAINNET,
  solana: ChainKey.SOLANA_MAINNET,
  tron: ChainKey.TRON_MAINNET,
  trx: ChainKey.TRON_MAINNET,
};

const WALLET_HISTORY_CALLBACK_PREFIX: string = 'wallet_history:';
const WALLET_HISTORY_PAGE_CALLBACK_PREFIX: string = 'wallet_history_page:';
const WALLET_HISTORY_REFRESH_CALLBACK_PREFIX: string = 'wallet_history_refresh:';
const WALLET_MENU_CALLBACK_PREFIX: string = 'wallet_menu:';
const WALLET_UNTRACK_CALLBACK_PREFIX: string = 'wallet_untrack:';
const WALLET_MUTE_CALLBACK_PREFIX: string = 'wallet_mute:';
const WALLET_FILTERS_CALLBACK_PREFIX: string = 'wallet_filters:';
const WALLET_FILTER_TOGGLE_CALLBACK_PREFIX: string = 'wallet_filter_toggle:';
const ALERT_IGNORE_CALLBACK_PREFIX: string = 'alert_ignore_24h:';
const CALLBACK_HISTORY_LIMIT: number = 10;

@Update()
export class TelegramUpdate {
  private readonly logger: Logger = new Logger(TelegramUpdate.name);
  private readonly userCommandQueue: Map<string, Promise<void>> = new Map<string, Promise<void>>();

  public constructor(
    private readonly trackingService: TrackingService,
    private readonly runtimeStatusService: RuntimeStatusService,
  ) {}

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

    const callbackTarget: WalletCallbackTarget | null = this.parseWalletCallbackData(callbackData);

    if (callbackTarget === null) {
      await this.answerCallbackSafe(ctx, 'Неизвестное действие.');
      return;
    }

    if (!userRef) {
      await this.answerCallbackSafe(ctx, 'Не удалось определить пользователя.');
      return;
    }

    await this.answerCallbackSafe(ctx, 'Выполняю действие...');

    try {
      const response: CommandExecutionResult = await this.executeWalletCallbackAction(
        userRef,
        callbackTarget,
      );
      await this.replyWithLog(ctx, response.message, updateMeta, response.replyOptions);
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Callback action failed: callbackData=${callbackData} reason=${errorMessage}`,
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
          {
            const historyResult: CommandExecutionResult = await this.executeHistoryCommand(
              userRef,
              commandEntry,
              updateMeta,
            );
            message = historyResult.message;
            replyOptions = historyResult.replyOptions;
          }
          break;
        case SupportedTelegramCommand.WALLET:
          {
            const walletResult: CommandExecutionResult = await this.executeWalletCommand(
              userRef,
              commandEntry,
              updateMeta,
            );
            message = walletResult.message;
            replyOptions = walletResult.replyOptions;
          }
          break;
        case SupportedTelegramCommand.STATUS:
          message = await this.executeStatusCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.FILTER:
          message = await this.executeFilterCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.THRESHOLD:
          message = await this.executeThresholdCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.FILTERS:
          message = await this.executeFiltersCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.WALLET_FILTERS:
          {
            const walletFiltersResult: CommandExecutionResult =
              await this.executeWalletFiltersCommand(userRef, commandEntry, updateMeta);
            message = walletFiltersResult.message;
            replyOptions = walletFiltersResult.replyOptions;
          }
          break;
        case SupportedTelegramCommand.WALLET_FILTER:
          {
            const walletFilterResult: CommandExecutionResult =
              await this.executeWalletFilterCommand(userRef, commandEntry, updateMeta);
            message = walletFilterResult.message;
            replyOptions = walletFilterResult.replyOptions;
          }
          break;
        case SupportedTelegramCommand.QUIET:
          message = await this.executeQuietCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.TZ:
          message = await this.executeTimezoneCommand(userRef, commandEntry, updateMeta);
          break;
        case SupportedTelegramCommand.MUTE:
          message = await this.executeMuteCommand(userRef, commandEntry, updateMeta);
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
    const parsedTrackArgs: {
      readonly chainKey: ChainKey;
      readonly address: string;
      readonly label: string | null;
    } | null = this.parseTrackArgs(commandEntry.args);

    if (!parsedTrackArgs) {
      this.logger.debug(
        `Track command rejected: missing address line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return [
        'Передай адрес для отслеживания.',
        'Форматы:',
        '/track <eth|sol|tron> <address> [label]',
        'Примеры:',
        '/track eth 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
        '/track sol 11111111111111111111111111111111 system',
        '/track tron TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 treasury',
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
      parsedTrackArgs.address,
      parsedTrackArgs.label,
      parsedTrackArgs.chainKey,
    );
    this.logger.log(
      `Track command success line=${commandEntry.lineNumber} telegramId=${userRef.telegramId} chainKey=${parsedTrackArgs.chainKey} address=${parsedTrackArgs.address} updateId=${updateMeta.updateId ?? 'n/a'}`,
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
        walletOptions.length > 0 ? this.buildWalletMenuInlineKeyboard(walletOptions) : null,
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
  ): Promise<CommandExecutionResult> {
    const rawAddress: string | null = commandEntry.args[0] ?? null;
    const rawLimit: string | null = commandEntry.args[1] ?? null;
    const rawKind: string | null = commandEntry.args[2] ?? null;
    const rawDirection: string | null = commandEntry.args[3] ?? null;

    if (!rawAddress) {
      this.logger.debug(
        `History command rejected: missing address line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: [
          'Передай адрес или id из /list.',
          'Формат: /history <address|#id> [limit] [kind] [direction]',
          'Примеры:',
          '/history #3 10',
          '/history 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 5',
          '/history #3 10 erc20 out',
        ].join('\n'),
        replyOptions: null,
      };
    }

    if (!userRef) {
      this.logger.warn(
        `History command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: 'Не удалось определить пользователя.',
        replyOptions: null,
      };
    }

    const historyPage: HistoryPageResult =
      await this.trackingService.getAddressHistoryPageWithPolicy(
        userRef,
        rawAddress,
        rawLimit,
        null,
        HistoryRequestSource.COMMAND,
        rawKind,
        rawDirection,
      );
    this.logger.log(
      `History command success line=${commandEntry.lineNumber} telegramId=${userRef.telegramId} address=${rawAddress} limit=${rawLimit ?? 'default'} updateId=${updateMeta.updateId ?? 'n/a'}`,
    );

    return {
      lineNumber: commandEntry.lineNumber,
      message: historyPage.message,
      replyOptions:
        historyPage.walletId !== null
          ? this.buildHistoryActionInlineKeyboard(historyPage)
          : this.buildHistoryReplyOptions(),
    };
  }

  private async executeWalletCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    if (!userRef) {
      this.logger.warn(
        `Wallet command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: 'Не удалось определить пользователя.',
        replyOptions: null,
      };
    }

    const rawWalletId: string | null = commandEntry.args[0] ?? null;

    if (!rawWalletId) {
      return {
        lineNumber: commandEntry.lineNumber,
        message: ['Передай id кошелька.', 'Формат: /wallet #3', 'Посмотреть id: /list'].join('\n'),
        replyOptions: null,
      };
    }

    const message: string = await this.trackingService.getWalletDetails(userRef, rawWalletId);
    const normalizedWalletId: number | null = this.parseWalletId(rawWalletId);

    return {
      lineNumber: commandEntry.lineNumber,
      message,
      replyOptions:
        normalizedWalletId !== null
          ? this.buildWalletActionInlineKeyboard(normalizedWalletId)
          : null,
    };
  }

  private async executeStatusCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (!userRef) {
      this.logger.warn(
        `Status command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const userStatus: string = await this.trackingService.getUserStatus(userRef);
    const runtimeSnapshot = this.runtimeStatusService.getSnapshot();

    return [
      'Runtime watcher status:',
      `- observed block: ${runtimeSnapshot.observedBlock ?? 'n/a'}`,
      `- processed block: ${runtimeSnapshot.processedBlock ?? 'n/a'}`,
      `- lag: ${runtimeSnapshot.lag ?? 'n/a'}`,
      `- queue size: ${runtimeSnapshot.queueSize}`,
      `- confirmations: ${runtimeSnapshot.confirmations}`,
      `- backoff ms: ${runtimeSnapshot.backoffMs}`,
      `- updated at: ${runtimeSnapshot.updatedAtIso ?? 'n/a'}`,
      '',
      userStatus,
    ].join('\n');
  }

  private async executeWalletCallbackAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    if (callbackTarget.action === WalletCallbackAction.MENU) {
      if (callbackTarget.walletId === null) {
        throw new Error('Callback не содержит id кошелька.');
      }

      const message: string = await this.trackingService.getWalletDetails(
        userRef,
        `#${callbackTarget.walletId}`,
      );

      return {
        lineNumber: 1,
        message,
        replyOptions: this.buildWalletActionInlineKeyboard(callbackTarget.walletId),
      };
    }

    if (callbackTarget.action === WalletCallbackAction.HISTORY) {
      if (callbackTarget.walletId === null) {
        throw new Error('Callback не содержит id кошелька для истории.');
      }

      const historyOffset: number = callbackTarget.historyOffset ?? 0;
      const historyLimit: number = callbackTarget.historyLimit ?? CALLBACK_HISTORY_LIMIT;
      const historyPage: HistoryPageResult =
        await this.trackingService.getAddressHistoryPageWithPolicy(
          userRef,
          `#${callbackTarget.walletId}`,
          String(historyLimit),
          String(historyOffset),
          HistoryRequestSource.CALLBACK,
          callbackTarget.historyKind,
          callbackTarget.historyDirection,
        );

      return {
        lineNumber: 1,
        message: historyPage.message,
        replyOptions: this.buildHistoryActionInlineKeyboard(historyPage),
      };
    }

    if (callbackTarget.action === WalletCallbackAction.UNTRACK) {
      if (callbackTarget.walletId === null) {
        throw new Error('Callback не содержит id кошелька.');
      }

      const message: string = await this.trackingService.untrackAddress(
        userRef,
        `#${callbackTarget.walletId}`,
      );

      return {
        lineNumber: 1,
        message,
        replyOptions: null,
      };
    }

    if (callbackTarget.action === WalletCallbackAction.MUTE) {
      const muteMinutes: number = callbackTarget.muteMinutes ?? 30;
      const message: string = await this.trackingService.setMuteAlerts(
        userRef,
        String(muteMinutes),
      );

      return {
        lineNumber: 1,
        message,
        replyOptions: null,
      };
    }

    if (callbackTarget.action === WalletCallbackAction.IGNORE_24H) {
      if (callbackTarget.walletId === null) {
        throw new Error('Callback не содержит id кошелька.');
      }

      const message: string = await this.trackingService.muteWalletAlertsForDuration(
        userRef,
        `#${String(callbackTarget.walletId)}`,
        1440,
        'alert_button',
      );

      return {
        lineNumber: 1,
        message,
        replyOptions: null,
      };
    }

    if (callbackTarget.walletId === null) {
      throw new Error('Callback не содержит id кошелька для фильтров.');
    }

    let walletFilterState: WalletAlertFilterState;

    if (callbackTarget.filterTarget !== null && callbackTarget.filterEnabled !== null) {
      const target: AlertFilterToggleTarget =
        callbackTarget.filterTarget === WalletCallbackFilterTarget.TRANSFER
          ? AlertFilterToggleTarget.TRANSFER
          : AlertFilterToggleTarget.SWAP;
      walletFilterState = await this.trackingService.setWalletEventTypeFilter(
        userRef,
        `#${callbackTarget.walletId}`,
        target,
        callbackTarget.filterEnabled,
      );
    } else {
      walletFilterState = await this.trackingService.getWalletAlertFilterState(
        userRef,
        `#${callbackTarget.walletId}`,
      );
    }

    return {
      lineNumber: 1,
      message: this.formatWalletFiltersMessage(walletFilterState),
      replyOptions: this.buildWalletFiltersInlineKeyboard(walletFilterState),
    };
  }

  private buildHistoryActionInlineKeyboard(historyPage: HistoryPageResult): ReplyOptions {
    const walletId: number | null = historyPage.walletId;
    const kindToken: string = historyPage.kind;
    const directionToken: string = historyPage.direction;
    const rows: InlineKeyboardButton.CallbackButton[][] = [];

    if (walletId !== null && historyPage.hasNextPage) {
      rows.push([
        {
          text: '➡️ Еще 10',
          callback_data: [
            `${WALLET_HISTORY_PAGE_CALLBACK_PREFIX}${String(walletId)}`,
            String(historyPage.offset + historyPage.limit),
            String(historyPage.limit),
            kindToken,
            directionToken,
          ].join(':'),
        },
      ]);
    }

    if (walletId !== null) {
      rows.push([
        {
          text: '🔄 Обновить',
          callback_data: [
            `${WALLET_HISTORY_REFRESH_CALLBACK_PREFIX}${String(walletId)}`,
            String(historyPage.limit),
            kindToken,
            directionToken,
          ].join(':'),
        },
        {
          text: '📁 Назад',
          callback_data: `${WALLET_MENU_CALLBACK_PREFIX}${String(walletId)}`,
        },
      ]);
      rows.push([
        {
          text: '🗑 Удалить',
          callback_data: `${WALLET_UNTRACK_CALLBACK_PREFIX}${String(walletId)}`,
        },
      ]);
    }

    const keyboard = Markup.inlineKeyboard(rows);

    return {
      reply_markup: keyboard.reply_markup,
      parse_mode: 'HTML',
      link_preview_options: {
        is_disabled: true,
      },
    };
  }

  private buildWalletFiltersInlineKeyboard(
    walletFilterState: WalletAlertFilterState,
  ): ReplyOptions {
    const walletId: number = walletFilterState.walletId;
    const nextTransferState: boolean = !walletFilterState.allowTransfer;
    const nextSwapState: boolean = !walletFilterState.allowSwap;
    const rows: InlineKeyboardButton.CallbackButton[][] = [
      [
        {
          text: `${walletFilterState.allowTransfer ? '✅' : '❌'} Transfer`,
          callback_data: this.buildWalletFilterToggleCallbackData(
            walletId,
            WalletCallbackFilterTarget.TRANSFER,
            nextTransferState,
          ),
        },
        {
          text: `${walletFilterState.allowSwap ? '✅' : '❌'} Swap`,
          callback_data: this.buildWalletFilterToggleCallbackData(
            walletId,
            WalletCallbackFilterTarget.SWAP,
            nextSwapState,
          ),
        },
      ],
      [
        {
          text: '📁 Назад',
          callback_data: `${WALLET_MENU_CALLBACK_PREFIX}${String(walletId)}`,
        },
        {
          text: '📜 История',
          callback_data: `${WALLET_HISTORY_CALLBACK_PREFIX}${String(walletId)}`,
        },
      ],
    ];

    return Markup.inlineKeyboard(rows);
  }

  private buildWalletFilterToggleCallbackData(
    walletId: number,
    filterTarget: WalletCallbackFilterTarget,
    enabled: boolean,
  ): string {
    const stateToken: string = enabled ? 'on' : 'off';
    return `${WALLET_FILTER_TOGGLE_CALLBACK_PREFIX}${String(walletId)}:${filterTarget}:${stateToken}`;
  }

  private formatWalletFiltersMessage(walletFilterState: WalletAlertFilterState): string {
    const labelText: string = walletFilterState.walletLabel ?? 'без ярлыка';
    const overrideMode: string = walletFilterState.hasWalletOverride
      ? 'персональные для кошелька'
      : 'наследуются от /filters';

    return [
      `⚙️ Фильтры кошелька #${String(walletFilterState.walletId)} (${labelText})`,
      `Chain: ${walletFilterState.chainKey}`,
      `Address: ${walletFilterState.walletAddress}`,
      `- transfer: ${walletFilterState.allowTransfer ? 'on' : 'off'}`,
      `- swap: ${walletFilterState.allowSwap ? 'on' : 'off'}`,
      `- режим: ${overrideMode}`,
      '',
      'Команды:',
      `/walletfilters #${String(walletFilterState.walletId)}`,
      `/wfilter #${String(walletFilterState.walletId)} transfer <on|off>`,
      `/wfilter #${String(walletFilterState.walletId)} swap <on|off>`,
    ].join('\n');
  }

  private async executeFiltersCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (!userRef) {
      this.logger.warn(
        `Filters command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const targetArg: string | null = commandEntry.args[0] ?? null;
    const stateArg: string | null = commandEntry.args[1] ?? null;

    if (!targetArg && !stateArg) {
      return this.trackingService.getUserAlertFilters(userRef);
    }

    if (!targetArg || !stateArg) {
      return ['Формат: /filters <transfer|swap> <on|off>', 'Или: /filters'].join('\n');
    }

    const normalizedTarget: string = targetArg.trim().toLowerCase();
    const normalizedState: string = stateArg.trim().toLowerCase();

    if (normalizedState !== 'on' && normalizedState !== 'off') {
      return 'Неверное значение. Используй on/off.';
    }

    const enabled: boolean = normalizedState === 'on';
    const target: AlertFilterToggleTarget | null =
      ALERT_FILTER_TARGET_MAP[normalizedTarget] ?? null;

    if (!target) {
      return 'Неизвестный фильтр. Используй transfer или swap.';
    }

    return this.trackingService.setEventTypeFilter(userRef, target, enabled);
  }

  private async executeFilterCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (!userRef) {
      this.logger.warn(
        `Filter command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const keyArg: string | null = commandEntry.args[0] ?? null;
    const valueArg: string | null =
      commandEntry.args.length > 1 ? commandEntry.args.slice(1).join(' ') : null;

    if (!keyArg || !valueArg) {
      return [
        'Форматы:',
        '/filter min_amount_usd <amount|off>',
        '/filter cex <off|in|out|all>',
        '/filter type <all|buy|sell|transfer>',
        '/filter include_dex <dex|off>',
        '/filter exclude_dex <dex|off>',
      ].join('\n');
    }

    const normalizedKey: string = keyArg.trim().toLowerCase();

    if (normalizedKey === 'min_amount_usd') {
      return this.trackingService.setMinAmountUsd(userRef, valueArg);
    }

    if (normalizedKey === 'cex') {
      return this.trackingService.setCexFlowFilter(userRef, valueArg);
    }

    if (normalizedKey === 'type') {
      return this.trackingService.setSmartFilterType(userRef, valueArg);
    }

    if (normalizedKey === 'include_dex') {
      return this.trackingService.setIncludeDexFilter(userRef, valueArg);
    }

    if (normalizedKey === 'exclude_dex') {
      return this.trackingService.setExcludeDexFilter(userRef, valueArg);
    }

    return 'Поддерживается: min_amount_usd, cex, type, include_dex, exclude_dex.';
  }

  private async executeThresholdCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (!userRef) {
      this.logger.warn(
        `Threshold command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const valueArg: string | null = commandEntry.args[0] ?? null;

    if (!valueArg) {
      return ['Формат: /threshold <amount|off>', 'Пример: /threshold 50000'].join('\n');
    }

    return this.trackingService.setThresholdUsd(userRef, valueArg);
  }

  private async executeQuietCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (!userRef) {
      this.logger.warn(
        `Quiet command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const windowArg: string | null = commandEntry.args[0] ?? null;

    if (!windowArg) {
      return ['Формат: /quiet <HH:mm-HH:mm|off>', 'Пример: /quiet 23:00-07:00'].join('\n');
    }

    return this.trackingService.setQuietHours(userRef, windowArg);
  }

  private async executeTimezoneCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (!userRef) {
      this.logger.warn(
        `Timezone command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const timezoneArg: string | null = commandEntry.args[0] ?? null;

    if (!timezoneArg) {
      return ['Формат: /tz <Area/City>', 'Пример: /tz Europe/Moscow'].join('\n');
    }

    return this.trackingService.setUserTimezone(userRef, timezoneArg);
  }

  private async executeWalletFiltersCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    if (!userRef) {
      this.logger.warn(
        `Wallet filters command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: 'Не удалось определить пользователя.',
        replyOptions: null,
      };
    }

    const rawWalletId: string | null = commandEntry.args[0] ?? null;

    if (!rawWalletId) {
      return {
        lineNumber: commandEntry.lineNumber,
        message: ['Передай id кошелька.', 'Формат: /walletfilters #3', 'Посмотреть id: /list'].join(
          '\n',
        ),
        replyOptions: null,
      };
    }

    const walletFilterState: WalletAlertFilterState =
      await this.trackingService.getWalletAlertFilterState(userRef, rawWalletId);

    return {
      lineNumber: commandEntry.lineNumber,
      message: this.formatWalletFiltersMessage(walletFilterState),
      replyOptions: this.buildWalletFiltersInlineKeyboard(walletFilterState),
    };
  }

  private async executeWalletFilterCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    if (!userRef) {
      this.logger.warn(
        `Wallet filter command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: 'Не удалось определить пользователя.',
        replyOptions: null,
      };
    }

    const rawWalletId: string | null = commandEntry.args[0] ?? null;
    const targetArg: string | null = commandEntry.args[1] ?? null;
    const stateArg: string | null = commandEntry.args[2] ?? null;

    if (!rawWalletId || !targetArg || !stateArg) {
      return {
        lineNumber: commandEntry.lineNumber,
        message: [
          'Формат: /wfilter <#id> <transfer|swap> <on|off>',
          'Пример: /wfilter #3 transfer off',
        ].join('\n'),
        replyOptions: null,
      };
    }

    const target: AlertFilterToggleTarget | null = this.resolveAlertFilterTarget(targetArg);
    const enabled: boolean | null = this.parseOnOffState(stateArg);

    if (target === null || enabled === null) {
      return {
        lineNumber: commandEntry.lineNumber,
        message: 'Неверные аргументы. Используй /wfilter <#id> <transfer|swap> <on|off>.',
        replyOptions: null,
      };
    }

    const walletFilterState: WalletAlertFilterState =
      await this.trackingService.setWalletEventTypeFilter(userRef, rawWalletId, target, enabled);

    return {
      lineNumber: commandEntry.lineNumber,
      message: this.formatWalletFiltersMessage(walletFilterState),
      replyOptions: this.buildWalletFiltersInlineKeyboard(walletFilterState),
    };
  }

  private resolveAlertFilterTarget(rawTarget: string): AlertFilterToggleTarget | null {
    const normalizedTarget: string = rawTarget.trim().toLowerCase();
    return ALERT_FILTER_TARGET_MAP[normalizedTarget] ?? null;
  }

  private parseOnOffState(rawState: string): boolean | null {
    const normalizedState: string = rawState.trim().toLowerCase();

    if (normalizedState === 'on') {
      return true;
    }

    if (normalizedState === 'off') {
      return false;
    }

    return null;
  }

  private async executeMuteCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (!userRef) {
      this.logger.warn(
        `Mute command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return 'Не удалось определить пользователя.';
    }

    const minutesArg: string | null = commandEntry.args[0] ?? null;

    if (!minutesArg) {
      return [
        'Передай время в минутах или off.',
        'Формат: /mute <minutes|off>',
        'Пример: /mute 30',
      ].join('\n');
    }

    return this.trackingService.setMuteAlerts(userRef, minutesArg);
  }

  private buildStartMessage(): string {
    return [
      'Whale Alert Bot готов к работе.',
      'Ниже есть меню-кнопки для быстрых действий.',
      '',
      'Что умею:',
      '1. Добавлять адреса в отслеживание.',
      '2. Показывать список с id для быстрых команд.',
      '3. Показывать последние транзакции для Ethereum и Solana.',
      '',
      'Быстрый старт:',
      '/track <eth|sol|tron> <address> [label]',
      '/list',
      '/wallet #id',
      '/history <address|#id> [limit]',
      '/status',
      '/threshold <amount|off>',
      '/filter min_amount_usd <amount|off>',
      '/filter cex <off|in|out|all>',
      '/filter type <all|buy|sell|transfer>',
      '/filter include_dex <dex|off>',
      '/filter exclude_dex <dex|off>',
      '/filters',
      '/walletfilters <#id>',
      '/wfilter <#id> <transfer|swap> <on|off>',
      '/quiet <HH:mm-HH:mm|off>',
      '/tz <Area/City>',
      '/mute <minutes|off>',
      '',
      'Можно отправлять несколько команд одним сообщением, по одной на строку.',
      'Подробности: /help',
    ].join('\n');
  }

  private buildHelpMessage(): string {
    return [
      'Команды:',
      '/track <eth|sol|tron> <address> [label] - добавить адрес',
      '/list - показать список адресов и их id',
      '/wallet <#id> - карточка кошелька и действия кнопками',
      '/untrack <address|id> - удалить адрес',
      '/history <address|#id> [limit] - последние транзакции',
      '/status - runtime статус watcher и quota',
      '/threshold <amount|off> - порог по USD',
      '/filter min_amount_usd <amount|off> - минимальная сумма в USD',
      '/filter cex <off|in|out|all> - фильтр потоков на CEX',
      '/filter type <all|buy|sell|transfer> - фильтр типа сделки',
      '/filter include_dex <dex|off> - оставить только выбранные DEX',
      '/filter exclude_dex <dex|off> - исключить DEX из алертов',
      '/filters - показать/изменить фильтры',
      '/walletfilters <#id> - фильтры конкретного кошелька',
      '/wfilter <#id> <transfer|swap> <on|off> - переключить фильтр кошелька',
      '/quiet <HH:mm-HH:mm|off> - тихие часы',
      '/tz <Area/City> - таймзона для quiet-hours',
      '/mute <minutes|off> - пауза алертов',
      '',
      'Примеры:',
      '/track eth 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
      '/track sol 11111111111111111111111111111111 system',
      '/track tron TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 treasury',
      '/history #1 10',
      '/filters transfer off',
      '/walletfilters #3',
      '/wfilter #3 transfer off',
      '/threshold 50000',
      '/filter min_amount_usd 100000',
      '/filter cex out',
      '/filter type buy',
      '/filter include_dex uniswap',
      '/filter exclude_dex off',
      '/quiet 23:00-07:00',
      '/tz Europe/Moscow',
      '/mute 30',
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
      '/track <eth|sol|tron> <address> [label]',
      '',
      'Примеры:',
      '/track eth 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik',
      '/track sol 11111111111111111111111111111111 system',
      '/track tron TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 treasury',
    ].join('\n');
  }

  private buildHistoryHintMessage(): string {
    return [
      'История транзакций:',
      '/history <address|#id> [limit]',
      'Примеры:',
      '/history #1 10',
      '/history 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 5',
      '/history 11111111111111111111111111111111 5',
    ].join('\n');
  }

  private buildUntrackHintMessage(): string {
    return [
      'Удаление адреса:',
      '/untrack <address|id>',
      'Примеры:',
      '/untrack #1',
      '/untrack 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      '/untrack 11111111111111111111111111111111',
    ].join('\n');
  }

  private parseTrackArgs(args: readonly string[]): {
    readonly chainKey: ChainKey;
    readonly address: string;
    readonly label: string | null;
  } | null {
    if (args.length === 0) {
      return null;
    }

    if (args.length < 2) {
      return null;
    }

    const firstArgCandidate: string | undefined = args[0];
    const addressCandidate: string | undefined = args[1];

    if (!firstArgCandidate || !addressCandidate) {
      return null;
    }

    const firstArg: string = firstArgCandidate.trim();
    const chainKeyByAlias: ChainKey | null = this.resolveTrackChainAlias(firstArg);

    if (chainKeyByAlias === null) {
      return null;
    }

    const address: string = addressCandidate.trim();
    const labelRaw: string | null = args.length > 2 ? args.slice(2).join(' ') : null;
    const label: string | null = labelRaw && labelRaw.trim().length > 0 ? labelRaw.trim() : null;

    return {
      chainKey: chainKeyByAlias,
      address,
      label,
    };
  }

  private resolveTrackChainAlias(rawChainAlias: string): ChainKey | null {
    const normalizedAlias: string = rawChainAlias.trim().toLowerCase();
    return TRACK_CHAIN_ALIAS_MAP[normalizedAlias] ?? null;
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

      if (command === SupportedTelegramCommand.TRACK) {
        const currentChainArg: string | undefined = args[0];
        const chainAlias: ChainKey | null =
          typeof currentChainArg === 'string' ? this.resolveTrackChainAlias(currentChainArg) : null;

        if (chainAlias !== null && typeof currentChainArg === 'string') {
          if (args.length === 1) {
            const nextLine: string | undefined = lines[lineIndex + 1];
            const nextTrimmedLine: string = nextLine?.trim() ?? '';

            if (nextTrimmedLine.length > 0 && !nextTrimmedLine.startsWith('/')) {
              args = [currentChainArg, nextTrimmedLine];
              lineIndex += 1;
            }
          }

          if (args.length === 2) {
            const currentAddressArg: string | undefined = args[1];
            const nextLine: string | undefined = lines[lineIndex + 1];
            const nextTrimmedLine: string = nextLine?.trim() ?? '';

            if (
              typeof currentAddressArg === 'string' &&
              nextTrimmedLine.length > 0 &&
              !nextTrimmedLine.startsWith('/')
            ) {
              args = [currentChainArg, currentAddressArg, nextTrimmedLine];
              lineIndex += 1;
            }
          }
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

  private parseWalletCallbackData(callbackData: string): WalletCallbackTarget | null {
    if (callbackData.startsWith(WALLET_MENU_CALLBACK_PREFIX)) {
      const walletId: number | null = this.parseWalletId(
        callbackData.slice(WALLET_MENU_CALLBACK_PREFIX.length),
      );

      if (walletId === null) {
        return null;
      }

      return {
        action: WalletCallbackAction.MENU,
        walletId,
        muteMinutes: null,
        historyOffset: null,
        historyLimit: null,
        historyKind: null,
        historyDirection: null,
        filterTarget: null,
        filterEnabled: null,
      };
    }

    if (callbackData.startsWith(WALLET_UNTRACK_CALLBACK_PREFIX)) {
      const walletId: number | null = this.parseWalletId(
        callbackData.slice(WALLET_UNTRACK_CALLBACK_PREFIX.length),
      );

      if (walletId === null) {
        return null;
      }

      return {
        action: WalletCallbackAction.UNTRACK,
        walletId,
        muteMinutes: null,
        historyOffset: null,
        historyLimit: null,
        historyKind: null,
        historyDirection: null,
        filterTarget: null,
        filterEnabled: null,
      };
    }

    if (callbackData.startsWith(WALLET_MUTE_CALLBACK_PREFIX)) {
      const rawMinutes: string = callbackData.slice(WALLET_MUTE_CALLBACK_PREFIX.length);

      if (!/^\d+$/.test(rawMinutes)) {
        return null;
      }

      return {
        action: WalletCallbackAction.MUTE,
        walletId: null,
        muteMinutes: Number.parseInt(rawMinutes, 10),
        historyOffset: null,
        historyLimit: null,
        historyKind: null,
        historyDirection: null,
        filterTarget: null,
        filterEnabled: null,
      };
    }

    if (callbackData.startsWith(ALERT_IGNORE_CALLBACK_PREFIX)) {
      const walletId: number | null = this.parseWalletId(
        callbackData.slice(ALERT_IGNORE_CALLBACK_PREFIX.length),
      );

      if (walletId === null) {
        return null;
      }

      return {
        action: WalletCallbackAction.IGNORE_24H,
        walletId,
        muteMinutes: 1440,
        historyOffset: null,
        historyLimit: null,
        historyKind: null,
        historyDirection: null,
        filterTarget: null,
        filterEnabled: null,
      };
    }

    if (callbackData.startsWith(WALLET_FILTER_TOGGLE_CALLBACK_PREFIX)) {
      const rawPayload: string = callbackData.slice(WALLET_FILTER_TOGGLE_CALLBACK_PREFIX.length);
      const payloadParts: readonly string[] = rawPayload.split(':');
      const rawWalletId: string | undefined = payloadParts[0];
      const rawFilterTarget: string | undefined = payloadParts[1];
      const rawState: string | undefined = payloadParts[2];

      if (
        rawWalletId === undefined ||
        rawFilterTarget === undefined ||
        rawState === undefined ||
        payloadParts.length !== 3
      ) {
        return null;
      }

      const walletId: number | null = this.parseWalletId(rawWalletId);
      const filterTarget: WalletCallbackFilterTarget | null =
        this.parseWalletCallbackFilterTarget(rawFilterTarget);
      const filterEnabled: boolean | null = this.parseOnOffState(rawState);

      if (walletId === null || filterTarget === null || filterEnabled === null) {
        return null;
      }

      return {
        action: WalletCallbackAction.FILTERS,
        walletId,
        muteMinutes: null,
        historyOffset: null,
        historyLimit: null,
        historyKind: null,
        historyDirection: null,
        filterTarget,
        filterEnabled,
      };
    }

    if (callbackData.startsWith(WALLET_FILTERS_CALLBACK_PREFIX)) {
      const walletId: number | null = this.parseWalletId(
        callbackData.slice(WALLET_FILTERS_CALLBACK_PREFIX.length),
      );

      if (walletId === null) {
        return null;
      }

      return {
        action: WalletCallbackAction.FILTERS,
        walletId,
        muteMinutes: null,
        historyOffset: null,
        historyLimit: null,
        historyKind: null,
        historyDirection: null,
        filterTarget: null,
        filterEnabled: null,
      };
    }

    if (callbackData.startsWith(WALLET_HISTORY_PAGE_CALLBACK_PREFIX)) {
      const rawPayload: string = callbackData.slice(WALLET_HISTORY_PAGE_CALLBACK_PREFIX.length);
      const payloadParts: readonly string[] = rawPayload.split(':');
      const rawWalletId: string | undefined = payloadParts[0];
      const rawOffset: string | undefined = payloadParts[1];
      const rawLimit: string | undefined = payloadParts[2];
      const rawKind: string | undefined = payloadParts[3];
      const rawDirection: string | undefined = payloadParts[4];

      if (
        rawWalletId === undefined ||
        rawOffset === undefined ||
        rawLimit === undefined ||
        (payloadParts.length !== 3 && payloadParts.length !== 5)
      ) {
        return null;
      }

      const walletId: number | null = this.parseWalletId(rawWalletId);
      const historyOffset: number | null = this.parseNonNegativeNumber(rawOffset);
      const historyLimit: number | null = this.parsePositiveNumber(rawLimit);

      if (walletId === null || historyOffset === null || historyLimit === null) {
        return null;
      }

      const historyKind: HistoryKind | null =
        rawKind !== undefined ? this.parseHistoryKindToken(rawKind) : HistoryKind.ALL;
      const historyDirection: HistoryDirectionFilter | null =
        rawDirection !== undefined
          ? this.parseHistoryDirectionToken(rawDirection)
          : HistoryDirectionFilter.ALL;

      if (historyKind === null || historyDirection === null) {
        return null;
      }

      return {
        action: WalletCallbackAction.HISTORY,
        walletId,
        muteMinutes: null,
        historyOffset,
        historyLimit,
        historyKind,
        historyDirection,
        filterTarget: null,
        filterEnabled: null,
      };
    }

    if (callbackData.startsWith(WALLET_HISTORY_REFRESH_CALLBACK_PREFIX)) {
      const rawPayload: string = callbackData.slice(WALLET_HISTORY_REFRESH_CALLBACK_PREFIX.length);
      const payloadParts: readonly string[] = rawPayload.split(':');
      const rawWalletId: string | undefined = payloadParts[0];
      const rawLimit: string | undefined = payloadParts[1];
      const rawKind: string | undefined = payloadParts[2];
      const rawDirection: string | undefined = payloadParts[3];

      if (
        rawWalletId === undefined ||
        rawLimit === undefined ||
        (payloadParts.length !== 2 && payloadParts.length !== 4)
      ) {
        return null;
      }

      const walletId: number | null = this.parseWalletId(rawWalletId);
      const historyLimit: number | null = this.parsePositiveNumber(rawLimit);

      if (walletId === null || historyLimit === null) {
        return null;
      }

      const historyKind: HistoryKind | null =
        rawKind !== undefined ? this.parseHistoryKindToken(rawKind) : HistoryKind.ALL;
      const historyDirection: HistoryDirectionFilter | null =
        rawDirection !== undefined
          ? this.parseHistoryDirectionToken(rawDirection)
          : HistoryDirectionFilter.ALL;

      if (historyKind === null || historyDirection === null) {
        return null;
      }

      return {
        action: WalletCallbackAction.HISTORY,
        walletId,
        muteMinutes: null,
        historyOffset: 0,
        historyLimit,
        historyKind,
        historyDirection,
        filterTarget: null,
        filterEnabled: null,
      };
    }

    if (callbackData.startsWith(WALLET_HISTORY_CALLBACK_PREFIX)) {
      const walletId: number | null = this.parseWalletId(
        callbackData.slice(WALLET_HISTORY_CALLBACK_PREFIX.length),
      );

      if (walletId === null) {
        return null;
      }

      return {
        action: WalletCallbackAction.HISTORY,
        walletId,
        muteMinutes: null,
        historyOffset: 0,
        historyLimit: CALLBACK_HISTORY_LIMIT,
        historyKind: HistoryKind.ALL,
        historyDirection: HistoryDirectionFilter.ALL,
        filterTarget: null,
        filterEnabled: null,
      };
    }

    return null;
  }

  private parseWalletId(rawWalletId: string): number | null {
    const normalizedWalletId: string = rawWalletId.trim().replace('#', '');

    if (!/^\d+$/.test(normalizedWalletId)) {
      return null;
    }

    return Number.parseInt(normalizedWalletId, 10);
  }

  private parseNonNegativeNumber(rawValue: string): number | null {
    const normalizedValue: string = rawValue.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      return null;
    }

    const parsedValue: number = Number.parseInt(normalizedValue, 10);

    if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
      return null;
    }

    return parsedValue;
  }

  private parsePositiveNumber(rawValue: string): number | null {
    const parsedValue: number | null = this.parseNonNegativeNumber(rawValue);

    if (parsedValue === null || parsedValue <= 0) {
      return null;
    }

    return parsedValue;
  }

  private parseHistoryKindToken(rawValue: string): HistoryKind | null {
    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (normalizedValue === 'all') {
      return HistoryKind.ALL;
    }

    if (normalizedValue === 'eth') {
      return HistoryKind.ETH;
    }

    if (normalizedValue === 'erc20') {
      return HistoryKind.ERC20;
    }

    return null;
  }

  private parseHistoryDirectionToken(rawValue: string): HistoryDirectionFilter | null {
    const normalizedValue: string = rawValue.trim().toLowerCase();

    if (normalizedValue === 'all') {
      return HistoryDirectionFilter.ALL;
    }

    if (normalizedValue === 'in') {
      return HistoryDirectionFilter.IN;
    }

    if (normalizedValue === 'out') {
      return HistoryDirectionFilter.OUT;
    }

    return null;
  }

  private parseWalletCallbackFilterTarget(
    rawFilterTarget: string,
  ): WalletCallbackFilterTarget | null {
    const normalizedFilterTarget: string = rawFilterTarget.trim().toLowerCase();

    if (normalizedFilterTarget === 'transfer') {
      return WalletCallbackFilterTarget.TRANSFER;
    }

    if (normalizedFilterTarget === 'swap') {
      return WalletCallbackFilterTarget.SWAP;
    }

    return null;
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
      ['🏠 Главное меню', '📋 Мой список', '📈 Статус'],
      ['➕ Добавить адрес', '📜 История', '⚙️ Фильтры'],
      ['🗑 Удалить адрес'],
      ['❓ Помощь'],
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

  private buildWalletMenuInlineKeyboard(
    walletOptions: readonly TrackedWalletOption[],
  ): ReplyOptions {
    const rows: InlineKeyboardButton.CallbackButton[][] = walletOptions.map(
      (wallet): InlineKeyboardButton.CallbackButton[] => [
        {
          text: this.buildWalletMenuButtonText(wallet),
          callback_data: `${WALLET_MENU_CALLBACK_PREFIX}${String(wallet.walletId)}`,
        },
      ],
    );

    return Markup.inlineKeyboard(rows);
  }

  private buildWalletActionInlineKeyboard(walletId: number): ReplyOptions {
    const rows: InlineKeyboardButton.CallbackButton[][] = [
      [
        {
          text: '📜 История',
          callback_data: [
            `${WALLET_HISTORY_REFRESH_CALLBACK_PREFIX}${String(walletId)}`,
            String(CALLBACK_HISTORY_LIMIT),
            HistoryKind.ALL,
            HistoryDirectionFilter.ALL,
          ].join(':'),
        },
        {
          text: '🪙 ERC20',
          callback_data: [
            `${WALLET_HISTORY_REFRESH_CALLBACK_PREFIX}${String(walletId)}`,
            String(CALLBACK_HISTORY_LIMIT),
            HistoryKind.ERC20,
            HistoryDirectionFilter.ALL,
          ].join(':'),
        },
      ],
      [
        {
          text: '⚙️ Фильтры',
          callback_data: `${WALLET_FILTERS_CALLBACK_PREFIX}${String(walletId)}`,
        },
        {
          text: '🔄 Обновить',
          callback_data: `${WALLET_MENU_CALLBACK_PREFIX}${String(walletId)}`,
        },
      ],
      [
        {
          text: '🗑 Удалить',
          callback_data: `${WALLET_UNTRACK_CALLBACK_PREFIX}${String(walletId)}`,
        },
      ],
    ];

    return Markup.inlineKeyboard(rows);
  }

  private buildWalletMenuButtonText(wallet: TrackedWalletOption): string {
    const titleSource: string = wallet.walletLabel ?? this.shortAddress(wallet.walletAddress);
    const normalizedTitle: string = titleSource.trim();
    const title: string =
      normalizedTitle.length > 24 ? `${normalizedTitle.slice(0, 21)}...` : normalizedTitle;

    return `📁 #${wallet.walletId} ${title}`;
  }

  private shortAddress(address: string): string {
    const prefix: string = address.slice(0, 8);
    const suffix: string = address.slice(-6);
    return `${prefix}...${suffix}`;
  }
}
