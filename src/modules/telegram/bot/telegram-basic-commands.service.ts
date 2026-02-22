import { Inject, Injectable, Logger } from '@nestjs/common';

import { TelegramParserService } from './telegram-parser.service';
import { TelegramUiService } from './telegram-ui.service';
import { USER_NOT_IDENTIFIED_MESSAGE } from './telegram.constants';
import type {
  CommandExecutionResult,
  ParsedMessageCommand,
  UpdateMeta,
} from './telegram.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { RuntimeStatusService } from '../../runtime/runtime-status.service';
import type { HistoryPageResult } from '../../whales/entities/history-page.interfaces';
import { HistoryRequestSource } from '../../whales/entities/history-rate-limiter.interfaces';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import { TrackingService } from '../../whales/services/tracking.service';

@Injectable()
export class TelegramBasicCommandsServiceDependencies {
  @Inject(TrackingService)
  public readonly trackingService!: TrackingService;

  @Inject(RuntimeStatusService)
  public readonly runtimeStatusService!: RuntimeStatusService;

  @Inject(AppConfigService)
  public readonly appConfigService!: AppConfigService;

  @Inject(TelegramParserService)
  public readonly parserService!: TelegramParserService;

  @Inject(TelegramUiService)
  public readonly uiService!: TelegramUiService;
}

@Injectable()
export class TelegramBasicCommandsService {
  private readonly logger: Logger = new Logger(TelegramBasicCommandsService.name);

  public constructor(private readonly deps: TelegramBasicCommandsServiceDependencies) {}

  public buildStartMessage(): string {
    return this.deps.uiService.buildStartMessage();
  }

  public buildHelpMessage(): string {
    return this.deps.uiService.buildHelpMessage();
  }

  public executeAppCommand(commandEntry: ParsedMessageCommand): CommandExecutionResult {
    const appEntryResult: CommandExecutionResult = this.deps.uiService.buildAppEntryResult();

    return {
      lineNumber: commandEntry.lineNumber,
      message: appEntryResult.message,
      replyOptions: appEntryResult.replyOptions,
    };
  }

  public buildTrackHintMessage(): string {
    return this.deps.uiService.buildTrackHintMessage();
  }

  public buildHistoryHintMessage(): string {
    return this.deps.uiService.buildHistoryHintMessage();
  }

  public buildUntrackHintMessage(): string {
    return this.deps.uiService.buildUntrackHintMessage();
  }

  public async executeTrackCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    const parsedTrackArgs = this.deps.parserService.parseTrackArgs(commandEntry.args);

    if (parsedTrackArgs === null) {
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

    if (userRef === null) {
      this.logger.warn(
        `Track command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return USER_NOT_IDENTIFIED_MESSAGE;
    }

    return this.deps.trackingService.trackAddress(
      userRef,
      parsedTrackArgs.address,
      parsedTrackArgs.label,
      parsedTrackArgs.chainKey,
    );
  }

  public async executeListCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    if (userRef === null) {
      this.logger.warn(
        `List command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: USER_NOT_IDENTIFIED_MESSAGE,
        replyOptions: null,
      };
    }

    const responseMessage: string = await this.deps.trackingService.listTrackedAddresses(userRef);
    const walletOptions = await this.deps.trackingService.listTrackedWalletOptions(userRef);

    return {
      lineNumber: commandEntry.lineNumber,
      message: responseMessage,
      replyOptions:
        walletOptions.length > 0
          ? this.deps.uiService.buildWalletMenuInlineKeyboard(walletOptions)
          : null,
    };
  }

  public async executeUntrackCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    const rawIdentifier: string | null = commandEntry.args[0] ?? null;

    if (rawIdentifier === null) {
      this.logger.debug(
        `Untrack command rejected: missing id/address line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return [
        'Передай id или адрес для удаления.',
        'Формат: /untrack <address|id>',
        'Пример: /untrack #3',
      ].join('\n');
    }

    if (userRef === null) {
      return USER_NOT_IDENTIFIED_MESSAGE;
    }

    return this.deps.trackingService.untrackAddress(userRef, rawIdentifier);
  }

  public async executeHistoryCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    const rawAddress: string | null = commandEntry.args[0] ?? null;
    const rawLimit: string | null = commandEntry.args[1] ?? null;
    const rawKind: string | null = commandEntry.args[2] ?? null;
    const rawDirection: string | null = commandEntry.args[3] ?? null;

    if (rawAddress === null) {
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

    if (userRef === null) {
      return {
        lineNumber: commandEntry.lineNumber,
        message: USER_NOT_IDENTIFIED_MESSAGE,
        replyOptions: null,
      };
    }

    const historyPage: HistoryPageResult =
      await this.deps.trackingService.getAddressHistoryPageWithPolicy(userRef, {
        rawAddress,
        rawLimit,
        rawOffset: null,
        source: HistoryRequestSource.COMMAND,
        rawKind,
        rawDirection,
      });

    return {
      lineNumber: commandEntry.lineNumber,
      message: historyPage.message,
      replyOptions:
        historyPage.walletId !== null
          ? this.deps.uiService.buildHistoryActionInlineKeyboard(historyPage)
          : this.deps.uiService.buildHistoryReplyOptions(),
    };
  }

  public async executeWalletCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    if (userRef === null) {
      this.logger.warn(
        `Wallet command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: USER_NOT_IDENTIFIED_MESSAGE,
        replyOptions: null,
      };
    }

    const rawWalletId: string | null = commandEntry.args[0] ?? null;

    if (rawWalletId === null) {
      return {
        lineNumber: commandEntry.lineNumber,
        message: ['Передай id кошелька.', 'Формат: /wallet #3', 'Посмотреть id: /list'].join('\n'),
        replyOptions: null,
      };
    }

    const message: string = await this.deps.trackingService.getWalletDetails(userRef, rawWalletId);
    const normalizedWalletId: number | null = this.parseWalletId(rawWalletId);

    return {
      lineNumber: commandEntry.lineNumber,
      message,
      replyOptions:
        normalizedWalletId !== null
          ? this.deps.uiService.buildWalletActionInlineKeyboard(normalizedWalletId)
          : null,
    };
  }

  public async executeStatusCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (userRef === null) {
      this.logger.warn(
        `Status command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return USER_NOT_IDENTIFIED_MESSAGE;
    }

    const userStatus: string = await this.deps.trackingService.getUserStatus(userRef);
    const runtimeSnapshot = this.deps.runtimeStatusService.getSnapshot();

    return [
      'Runtime watcher status:',
      `- app version: ${this.deps.appConfigService.appVersion}`,
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

  private parseWalletId(rawWalletId: string): number | null {
    const normalizedWalletId: string = rawWalletId.trim().replace('#', '');

    if (!/^\d+$/.test(normalizedWalletId)) {
      return null;
    }

    return Number.parseInt(normalizedWalletId, 10);
  }
}
