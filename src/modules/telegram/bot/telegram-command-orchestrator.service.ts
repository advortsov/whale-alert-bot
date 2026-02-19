import { Injectable } from '@nestjs/common';

import { TelegramBasicCommandsService } from './telegram-basic-commands.service';
import { TelegramCallbackCommandsService } from './telegram-callback-commands.service';
import { TelegramFilterCommandsService } from './telegram-filter-commands.service';
import {
  SupportedTelegramCommand,
  type CommandExecutionResult,
  type ParsedMessageCommand,
  type UpdateMeta,
  type WalletCallbackTarget,
} from './telegram.interfaces';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';

type ITelegramCommandHandler = (
  userRef: TelegramUserRef | null,
  commandEntry: ParsedMessageCommand,
  updateMeta: UpdateMeta,
) => Promise<CommandExecutionResult>;

@Injectable()
export class TelegramCommandOrchestratorService {
  public constructor(
    private readonly basicCommandsService: TelegramBasicCommandsService,
    private readonly filterCommandsService: TelegramFilterCommandsService,
    private readonly callbackCommandsService: TelegramCallbackCommandsService,
  ) {}

  public async executeParsedCommands(
    commands: readonly ParsedMessageCommand[],
    userRef: TelegramUserRef | null,
    updateMeta: UpdateMeta,
  ): Promise<readonly CommandExecutionResult[]> {
    const results: CommandExecutionResult[] = [];

    for (const commandEntry of commands) {
      const handler: ITelegramCommandHandler | null = this.resolveCommandHandler(
        commandEntry.command,
      );
      const commandResult: CommandExecutionResult =
        handler !== null
          ? await handler(userRef, commandEntry, updateMeta)
          : {
              lineNumber: commandEntry.lineNumber,
              message: 'Неизвестная команда. Используй /help.',
              replyOptions: null,
            };
      results.push(commandResult);
    }

    return results;
  }

  public async executeWalletCallbackAction(
    userRef: TelegramUserRef,
    callbackTarget: WalletCallbackTarget,
  ): Promise<CommandExecutionResult> {
    return this.callbackCommandsService.executeWalletCallbackAction(userRef, callbackTarget);
  }

  private resolveCommandHandler(command: SupportedTelegramCommand): ITelegramCommandHandler | null {
    const handlers: Partial<Record<SupportedTelegramCommand, ITelegramCommandHandler>> = {
      [SupportedTelegramCommand.START]: this.executeStartCommand.bind(this),
      [SupportedTelegramCommand.HELP]: this.executeHelpCommand.bind(this),
      [SupportedTelegramCommand.TRACK]: this.executeTrackCommand.bind(this),
      [SupportedTelegramCommand.LIST]: this.basicCommandsService.executeListCommand.bind(
        this.basicCommandsService,
      ),
      [SupportedTelegramCommand.UNTRACK]: this.executeUntrackCommand.bind(this),
      [SupportedTelegramCommand.HISTORY]: this.basicCommandsService.executeHistoryCommand.bind(
        this.basicCommandsService,
      ),
      [SupportedTelegramCommand.WALLET]: this.basicCommandsService.executeWalletCommand.bind(
        this.basicCommandsService,
      ),
      [SupportedTelegramCommand.STATUS]: this.executeStatusCommand.bind(this),
      [SupportedTelegramCommand.FILTER]: this.executeFilterCommand.bind(this),
      [SupportedTelegramCommand.THRESHOLD]: this.executeThresholdCommand.bind(this),
      [SupportedTelegramCommand.FILTERS]: this.executeFiltersCommand.bind(this),
      [SupportedTelegramCommand.WALLET_FILTERS]:
        this.filterCommandsService.executeWalletFiltersCommand.bind(this.filterCommandsService),
      [SupportedTelegramCommand.WALLET_FILTER]:
        this.filterCommandsService.executeWalletFilterCommand.bind(this.filterCommandsService),
      [SupportedTelegramCommand.QUIET]: this.executeQuietCommand.bind(this),
      [SupportedTelegramCommand.TZ]: this.executeTimezoneCommand.bind(this),
      [SupportedTelegramCommand.MUTE]: this.executeMuteCommand.bind(this),
      [SupportedTelegramCommand.TRACK_HINT]: this.executeTrackHintCommand.bind(this),
      [SupportedTelegramCommand.HISTORY_HINT]: this.executeHistoryHintCommand.bind(this),
      [SupportedTelegramCommand.UNTRACK_HINT]: this.executeUntrackHintCommand.bind(this),
    };

    return handlers[command] ?? null;
  }

  private async executeStartCommand(
    _userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    _updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: this.basicCommandsService.buildStartMessage(),
      replyOptions: null,
    };
  }

  private async executeHelpCommand(
    _userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    _updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: this.basicCommandsService.buildHelpMessage(),
      replyOptions: null,
    };
  }

  private async executeTrackCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.basicCommandsService.executeTrackCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeUntrackCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.basicCommandsService.executeUntrackCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeStatusCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.basicCommandsService.executeStatusCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeFiltersCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.filterCommandsService.executeFiltersCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeFilterCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.filterCommandsService.executeFilterCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeThresholdCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.filterCommandsService.executeThresholdCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeQuietCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.filterCommandsService.executeQuietCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeTimezoneCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.filterCommandsService.executeTimezoneCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeMuteCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: await this.filterCommandsService.executeMuteCommand(
        userRef,
        commandEntry,
        updateMeta,
      ),
      replyOptions: null,
    };
  }

  private async executeTrackHintCommand(
    _userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    _updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: this.basicCommandsService.buildTrackHintMessage(),
      replyOptions: null,
    };
  }

  private async executeHistoryHintCommand(
    _userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    _updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: this.basicCommandsService.buildHistoryHintMessage(),
      replyOptions: null,
    };
  }

  private async executeUntrackHintCommand(
    _userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    _updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    return {
      lineNumber: commandEntry.lineNumber,
      message: this.basicCommandsService.buildUntrackHintMessage(),
      replyOptions: null,
    };
  }
}
