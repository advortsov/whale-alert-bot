import { Inject, Injectable, Logger } from '@nestjs/common';

import { GlobalDexFilterMode } from './telegram-global-filters-callback.interfaces';
import { TelegramGlobalFiltersUiService } from './telegram-global-filters-ui.service';
import { TelegramParserService } from './telegram-parser.service';
import { TelegramUiService } from './telegram-ui.service';
import { USER_NOT_IDENTIFIED_MESSAGE } from './telegram.constants';
import type {
  CommandExecutionResult,
  ParsedMessageCommand,
  UpdateMeta,
} from './telegram.interfaces';
import {
  AlertFilterToggleTarget,
  type TelegramUserRef,
  type WalletAlertFilterState,
} from '../../whales/entities/tracking.interfaces';
import { TrackingService } from '../../whales/services/tracking.service';

@Injectable()
export class TelegramFilterCommandsServiceDependencies {
  @Inject(TrackingService)
  public readonly trackingService!: TrackingService;

  @Inject(TelegramParserService)
  public readonly parserService!: TelegramParserService;

  @Inject(TelegramUiService)
  public readonly uiService!: TelegramUiService;

  @Inject(TelegramGlobalFiltersUiService)
  public readonly globalFiltersUiService!: TelegramGlobalFiltersUiService;
}

@Injectable()
export class TelegramFilterCommandsService {
  private readonly logger: Logger = new Logger(TelegramFilterCommandsService.name);

  public constructor(private readonly deps: TelegramFilterCommandsServiceDependencies) {}

  public async executeFiltersCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    if (userRef === null) {
      this.logger.warn(
        `Filters command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: USER_NOT_IDENTIFIED_MESSAGE,
        replyOptions: null,
      };
    }

    const resolvedArgs = this.resolveFiltersArgs(commandEntry.args);

    if (resolvedArgs.mode === 'show') {
      const settingsResult = await this.deps.trackingService.getSettings(userRef);
      return {
        lineNumber: commandEntry.lineNumber,
        message: this.deps.globalFiltersUiService.formatGlobalDexFiltersMessage(
          settingsResult,
          GlobalDexFilterMode.INCLUDE,
        ),
        replyOptions: this.deps.globalFiltersUiService.buildGlobalDexFiltersInlineKeyboard(
          settingsResult,
          GlobalDexFilterMode.INCLUDE,
        ),
      };
    }

    if (resolvedArgs.mode === 'error') {
      return {
        lineNumber: commandEntry.lineNumber,
        message: resolvedArgs.message,
        replyOptions: null,
      };
    }

    const enabled: boolean = resolvedArgs.enabled;
    const target: AlertFilterToggleTarget = resolvedArgs.target;
    const resultMessage: string = await this.deps.trackingService.setEventTypeFilter(
      userRef,
      target,
      enabled,
    );
    const settingsResult = await this.deps.trackingService.getSettings(userRef);

    return {
      lineNumber: commandEntry.lineNumber,
      message: [
        resultMessage,
        '',
        this.deps.globalFiltersUiService.formatGlobalDexFiltersMessage(
          settingsResult,
          GlobalDexFilterMode.INCLUDE,
        ),
      ].join('\n'),
      replyOptions: this.deps.globalFiltersUiService.buildGlobalDexFiltersInlineKeyboard(
        settingsResult,
        GlobalDexFilterMode.INCLUDE,
      ),
    };
  }

  public async executeFilterCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (userRef === null) {
      this.logger.warn(
        `Filter command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return USER_NOT_IDENTIFIED_MESSAGE;
    }

    const parsedFilterArgs = this.parseFilterArgs(commandEntry.args);

    if (parsedFilterArgs === null) {
      return [
        'Форматы:',
        '/filter min_amount_usd <amount|off> (legacy alias -> /threshold)',
        '/filter cex <off|in|out|all>',
        '/filter type <all|buy|sell|transfer>',
        '/filter include_dex <dex|off>',
        '/filter exclude_dex <dex|off>',
      ].join('\n');
    }

    return this.applyFilterCommand(userRef, parsedFilterArgs.key, parsedFilterArgs.value);
  }

  public async executeThresholdCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (userRef === null) {
      this.logger.warn(
        `Threshold command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return USER_NOT_IDENTIFIED_MESSAGE;
    }

    const valueArg: string | null = commandEntry.args[0] ?? null;

    if (!valueArg) {
      return ['Формат: /threshold <amount|off>', 'Пример: /threshold 50000'].join('\n');
    }

    return this.deps.trackingService.setThresholdUsd(userRef, valueArg);
  }

  public async executeQuietCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (userRef === null) {
      this.logger.warn(
        `Quiet command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return USER_NOT_IDENTIFIED_MESSAGE;
    }

    const windowArg: string | null = commandEntry.args[0] ?? null;

    if (!windowArg) {
      return ['Формат: /quiet <HH:mm-HH:mm|off>', 'Пример: /quiet 23:00-07:00'].join('\n');
    }

    return this.deps.trackingService.setQuietHours(userRef, windowArg);
  }

  public async executeTimezoneCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (userRef === null) {
      this.logger.warn(
        `Timezone command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return USER_NOT_IDENTIFIED_MESSAGE;
    }

    const timezoneArg: string | null = commandEntry.args[0] ?? null;

    if (!timezoneArg) {
      return ['Формат: /tz <Area/City>', 'Пример: /tz Europe/Moscow'].join('\n');
    }

    return this.deps.trackingService.setUserTimezone(userRef, timezoneArg);
  }

  public async executeWalletFiltersCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    if (userRef === null) {
      this.logger.warn(
        `Wallet filters command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
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
        message: ['Передай id кошелька.', 'Формат: /walletfilters #3', 'Посмотреть id: /list'].join(
          '\n',
        ),
        replyOptions: null,
      };
    }

    const walletFilterState: WalletAlertFilterState =
      await this.deps.trackingService.getWalletAlertFilterState(userRef, rawWalletId);

    return {
      lineNumber: commandEntry.lineNumber,
      message: this.deps.uiService.formatWalletFiltersMessage(walletFilterState),
      replyOptions: this.deps.uiService.buildWalletFiltersInlineKeyboard(walletFilterState),
    };
  }

  public async executeWalletFilterCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<CommandExecutionResult> {
    if (userRef === null) {
      this.logger.warn(
        `Wallet filter command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return {
        lineNumber: commandEntry.lineNumber,
        message: USER_NOT_IDENTIFIED_MESSAGE,
        replyOptions: null,
      };
    }

    const parsedArgs = this.parseWalletFilterArgs(commandEntry.args);

    if (parsedArgs === null) {
      return {
        lineNumber: commandEntry.lineNumber,
        message: [
          'Формат: /wfilter <#id> <transfer|swap> <on|off>',
          'Пример: /wfilter #3 transfer off',
        ].join('\n'),
        replyOptions: null,
      };
    }

    if (parsedArgs.target === null || parsedArgs.enabled === null) {
      return {
        lineNumber: commandEntry.lineNumber,
        message: 'Неверные аргументы. Используй /wfilter <#id> <transfer|swap> <on|off>.',
        replyOptions: null,
      };
    }

    const walletFilterState: WalletAlertFilterState =
      await this.deps.trackingService.setWalletEventTypeFilter(
        userRef,
        parsedArgs.walletId,
        parsedArgs.target,
        parsedArgs.enabled,
      );

    return {
      lineNumber: commandEntry.lineNumber,
      message: this.deps.uiService.formatWalletFiltersMessage(walletFilterState),
      replyOptions: this.deps.uiService.buildWalletFiltersInlineKeyboard(walletFilterState),
    };
  }

  public async executeMuteCommand(
    userRef: TelegramUserRef | null,
    commandEntry: ParsedMessageCommand,
    updateMeta: UpdateMeta,
  ): Promise<string> {
    if (userRef === null) {
      this.logger.warn(
        `Mute command rejected: user context is missing line=${commandEntry.lineNumber} updateId=${updateMeta.updateId ?? 'n/a'}`,
      );
      return USER_NOT_IDENTIFIED_MESSAGE;
    }

    const minutesArg: string | null = commandEntry.args[0] ?? null;

    if (!minutesArg) {
      return [
        'Передай время в минутах или off.',
        'Формат: /mute <minutes|off>',
        'Пример: /mute 30',
      ].join('\n');
    }

    return this.deps.trackingService.setMuteAlerts(userRef, minutesArg);
  }

  private resolveFiltersArgs(args: readonly string[]): {
    readonly mode: 'show' | 'error' | 'ready';
    readonly message: string;
    readonly target: AlertFilterToggleTarget;
    readonly enabled: boolean;
  } {
    const targetArg: string | null = args[0] ?? null;
    const stateArg: string | null = args[1] ?? null;

    if (!targetArg && !stateArg) {
      return {
        mode: 'show',
        message: '',
        target: AlertFilterToggleTarget.TRANSFER,
        enabled: true,
      };
    }

    if (!targetArg || !stateArg) {
      return {
        mode: 'error',
        message: ['Формат: /filters <transfer|swap> <on|off>', 'Или: /filters'].join('\n'),
        target: AlertFilterToggleTarget.TRANSFER,
        enabled: true,
      };
    }

    const enabled: boolean | null = this.deps.parserService.parseOnOffState(stateArg);

    if (enabled === null) {
      return {
        mode: 'error',
        message: 'Неверное значение. Используй on/off.',
        target: AlertFilterToggleTarget.TRANSFER,
        enabled: true,
      };
    }

    const target: AlertFilterToggleTarget | null =
      this.deps.parserService.resolveAlertFilterTarget(targetArg);

    if (target === null) {
      return {
        mode: 'error',
        message: 'Неизвестный фильтр. Используй transfer или swap.',
        target: AlertFilterToggleTarget.TRANSFER,
        enabled,
      };
    }

    return {
      mode: 'ready',
      message: '',
      target,
      enabled,
    };
  }

  private parseWalletFilterArgs(args: readonly string[]): {
    readonly walletId: string;
    readonly target: AlertFilterToggleTarget | null;
    readonly enabled: boolean | null;
  } | null {
    const walletId: string | null = args[0] ?? null;
    const targetArg: string | null = args[1] ?? null;
    const stateArg: string | null = args[2] ?? null;

    if (!walletId || !targetArg || !stateArg) {
      return null;
    }

    return {
      walletId,
      target: this.deps.parserService.resolveAlertFilterTarget(targetArg),
      enabled: this.deps.parserService.parseOnOffState(stateArg),
    };
  }

  private parseFilterArgs(args: readonly string[]): {
    readonly key: string;
    readonly value: string;
  } | null {
    const keyArg: string | null = args[0] ?? null;
    const valueArg: string | null = args.length > 1 ? args.slice(1).join(' ') : null;

    if (!keyArg || !valueArg) {
      return null;
    }

    return {
      key: keyArg.trim().toLowerCase(),
      value: valueArg,
    };
  }

  private async applyFilterCommand(
    userRef: TelegramUserRef,
    normalizedKey: string,
    value: string,
  ): Promise<string> {
    const handlers: readonly {
      readonly key: string;
      readonly run: () => Promise<string>;
    }[] = [
      {
        key: 'min_amount_usd',
        run: async (): Promise<string> => this.deps.trackingService.setMinAmountUsd(userRef, value),
      },
      {
        key: 'cex',
        run: async (): Promise<string> =>
          this.deps.trackingService.setCexFlowFilter(userRef, value),
      },
      {
        key: 'type',
        run: async (): Promise<string> =>
          this.deps.trackingService.setSmartFilterType(userRef, value),
      },
      {
        key: 'include_dex',
        run: async (): Promise<string> =>
          this.deps.trackingService.setIncludeDexFilter(userRef, value),
      },
      {
        key: 'exclude_dex',
        run: async (): Promise<string> =>
          this.deps.trackingService.setExcludeDexFilter(userRef, value),
      },
    ];
    const matchedHandler = handlers.find((handler): boolean => handler.key === normalizedKey);

    if (matchedHandler !== undefined) {
      return matchedHandler.run();
    }

    return 'Поддерживается: cex, type, include_dex, exclude_dex, min_amount_usd (legacy alias -> /threshold).';
  }
}
