import { Injectable } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { InlineKeyboardButton, KeyboardButton } from 'telegraf/types';

import { appendVersionQuery } from './telegram-webapp-url.util';
import {
  CALLBACK_HISTORY_LIMIT,
  ELLIPSIS_LENGTH,
  GLOBAL_FILTERS_REFRESH_CALLBACK_VALUE,
  SHORT_ADDRESS_PREFIX_LENGTH,
  SHORT_ADDRESS_SUFFIX_OFFSET,
  WALLET_BUTTON_TITLE_MAX_LENGTH,
  WALLET_FILTER_TOGGLE_CALLBACK_PREFIX,
  WALLET_FILTERS_CALLBACK_PREFIX,
  WALLET_HISTORY_CALLBACK_PREFIX,
  WALLET_HISTORY_PAGE_CALLBACK_PREFIX,
  WALLET_HISTORY_REFRESH_CALLBACK_PREFIX,
  WALLET_MENU_CALLBACK_PREFIX,
  WALLET_UNTRACK_CALLBACK_PREFIX,
} from './telegram.constants';
import {
  WalletCallbackFilterTarget,
  type CommandExecutionResult,
  type ReplyOptions,
} from './telegram.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import type { HistoryPageResult } from '../../whales/entities/history-page.interfaces';
import { HistoryDirectionFilter, HistoryKind } from '../../whales/entities/history-request.dto';
import type {
  TrackedWalletOption,
  WalletAlertFilterState,
} from '../../whales/entities/tracking.interfaces';

@Injectable()
export class TelegramUiService {
  public constructor(private readonly appConfigService: AppConfigService) {}

  public buildStartMessage(): string {
    return [
      'Whale Alert Bot готов к работе.',
      '🚀 Mini App вынесен в верхнюю кнопку меню и кнопку ниже.',
      'Ниже есть меню-кнопки для быстрых действий.',
      '',
      'Что умею:',
      '1. Добавлять адреса в отслеживание.',
      '2. Показывать список с id для быстрых команд.',
      '3. Показывать последние транзакции для Ethereum, Solana и TRON.',
      '',
      'Быстрый старт:',
      '/track <eth|sol|tron> <address> [label]',
      '/list',
      '/wallet #id',
      '/history <address|#id> [limit]',
      '/app',
      '/status',
      '/threshold <amount|off>',
      '/filter min_amount_usd <amount|off> (legacy alias -> /threshold)',
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

  public buildHelpMessage(): string {
    return [
      'Команды:',
      '/track <eth|sol|tron> <address> [label] - добавить адрес',
      '/list - показать список адресов и их id',
      '/wallet <#id> - карточка кошелька и действия кнопками',
      '/app - открыть Telegram Mini App',
      '/untrack <address|id> - удалить адрес',
      '/history <address|#id> [limit] - последние транзакции',
      '/status - runtime статус watcher и quota',
      '/threshold <amount|off> - единый USD порог алерта',
      '/filter min_amount_usd <amount|off> - legacy alias для /threshold',
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

  public buildTrackHintMessage(): string {
    return `Добавление адреса:\n/track <eth|sol|tron> <address> [label]\n\nПримеры:\n/track eth 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 vitalik\n/track sol 11111111111111111111111111111111 system\n/track tron TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 treasury`;
  }

  public buildHistoryHintMessage(): string {
    return `История транзакций:\n/history <address|#id> [limit]\nПримеры:\n/history #1 10\n/history 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 5\n/history 11111111111111111111111111111111 5\n/history TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 5`;
  }

  public buildUntrackHintMessage(): string {
    return `Удаление адреса:\n/untrack <address|id>\nПримеры:\n/untrack #1\n/untrack 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045\n/untrack 11111111111111111111111111111111\n/untrack TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7`;
  }

  public formatExecutionResults(results: readonly CommandExecutionResult[]): string {
    if (results.length === 1) {
      const singleResult: CommandExecutionResult | undefined = results[0];
      return singleResult?.message ?? 'Команда не распознана.';
    }

    const rowMessages: readonly string[] = results.map(
      (result: CommandExecutionResult, index: number): string =>
        [`${index + 1}. Строка ${result.lineNumber}:`, result.message].join('\n'),
    );

    return [`Обработано команд: ${results.length}`, ...rowMessages].join('\n\n');
  }

  public resolveReplyOptions(results: readonly CommandExecutionResult[]): ReplyOptions | null {
    if (results.length === 1) {
      const onlyResult: CommandExecutionResult | undefined = results[0];

      if (onlyResult?.replyOptions) {
        return onlyResult.replyOptions;
      }
    }

    return null;
  }

  public buildHistoryActionInlineKeyboard(historyPage: HistoryPageResult): ReplyOptions {
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

  public buildWalletFiltersInlineKeyboard(walletFilterState: WalletAlertFilterState): ReplyOptions {
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
      [
        {
          text: '↩️ К глобальным /filters',
          callback_data: GLOBAL_FILTERS_REFRESH_CALLBACK_VALUE,
        },
      ],
    ];

    return Markup.inlineKeyboard(rows);
  }

  public formatWalletFiltersMessage(walletFilterState: WalletAlertFilterState): string {
    const labelText: string = walletFilterState.walletLabel ?? 'без ярлыка';
    const overrideMode: string = walletFilterState.hasWalletOverride
      ? 'персональные для кошелька'
      : 'наследуются от /filters';

    return [
      `⚙️ Фильтры кошелька #${String(walletFilterState.walletId)} (${labelText})`,
      `Chain: ${walletFilterState.chainKey}`,
      `Address: ${walletFilterState.walletAddress}`,
      `- effective transfer: ${walletFilterState.allowTransfer ? 'on' : 'off'}`,
      `- effective swap: ${walletFilterState.allowSwap ? 'on' : 'off'}`,
      `- источник: ${overrideMode}`,
      '- DEX-фильтры берутся из глобального /filters',
      '',
      'Команды:',
      `/walletfilters #${String(walletFilterState.walletId)}`,
      `/wfilter #${String(walletFilterState.walletId)} transfer <on|off>`,
      `/wfilter #${String(walletFilterState.walletId)} swap <on|off>`,
    ].join('\n');
  }

  public buildReplyOptions(): ReplyOptions {
    const appUrl: string | null = this.resolveTmaRootUrl();
    const rows: (string | KeyboardButton)[][] = [
      ['➕ Добавить адрес', '📋 Мой список', '📜 История'],
      ['⚙️ Фильтры', '📈 Статус', '❓ Помощь'],
      ['🗑 Удалить адрес', '🏠 Главное меню'],
    ];

    if (appUrl !== null) {
      rows.unshift([
        {
          text: '🚀 Mini App',
          web_app: {
            url: appUrl,
          },
        },
      ]);
    } else {
      rows.unshift(['📱 Приложение']);
    }

    return Markup.keyboard(rows).resize().persistent();
  }

  public buildStartReplyOptions(): ReplyOptions | null {
    const appEntryResult: CommandExecutionResult = this.buildAppEntryResult();
    return appEntryResult.replyOptions;
  }

  public buildHistoryReplyOptions(): ReplyOptions {
    return {
      ...this.buildReplyOptions(),
      parse_mode: 'HTML',
      link_preview_options: {
        is_disabled: true,
      },
    };
  }

  public buildWalletMenuInlineKeyboard(
    walletOptions: readonly TrackedWalletOption[],
  ): ReplyOptions {
    const rows: InlineKeyboardButton[][] = walletOptions.map((wallet): InlineKeyboardButton[] => [
      {
        text: this.buildWalletMenuButtonText(wallet),
        callback_data: `${WALLET_MENU_CALLBACK_PREFIX}${String(wallet.walletId)}`,
      },
    ]);

    return Markup.inlineKeyboard(rows);
  }

  public buildAppEntryResult(): CommandExecutionResult {
    const appUrl: string | null = this.resolveTmaRootUrl();

    if (appUrl === null) {
      return {
        lineNumber: 1,
        message:
          'Mini App пока не настроен. Нужен TMA_BASE_URL (например https://your-domain/tma).',
        replyOptions: null,
      };
    }

    return {
      lineNumber: 1,
      message: 'Открой Mini App кнопкой ниже.',
      replyOptions: Markup.inlineKeyboard([
        [
          {
            text: '📱 Открыть приложение',
            web_app: {
              url: appUrl,
            },
          },
        ],
      ]),
    };
  }

  public buildWalletActionInlineKeyboard(walletId: number): ReplyOptions {
    const rows: InlineKeyboardButton[][] = [
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
          text: '🗑 Удалить',
          callback_data: `${WALLET_UNTRACK_CALLBACK_PREFIX}${String(walletId)}`,
        },
      ],
    ];

    const walletAppUrl: string | null = this.buildWalletAppUrl(walletId);

    if (walletAppUrl !== null) {
      rows.splice(2, 0, [
        {
          text: '📱 Открыть в TMA',
          web_app: {
            url: walletAppUrl,
          },
        },
      ]);
    }

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

  private buildWalletMenuButtonText(wallet: TrackedWalletOption): string {
    const titleSource: string = wallet.walletLabel ?? this.shortAddress(wallet.walletAddress);
    const normalizedTitle: string = titleSource.trim();
    const title: string =
      normalizedTitle.length > WALLET_BUTTON_TITLE_MAX_LENGTH + ELLIPSIS_LENGTH
        ? `${normalizedTitle.slice(0, WALLET_BUTTON_TITLE_MAX_LENGTH)}...`
        : normalizedTitle;

    return `📁 #${wallet.walletId} ${title}`;
  }

  private shortAddress(address: string): string {
    const prefix: string = address.slice(0, SHORT_ADDRESS_PREFIX_LENGTH);
    const suffix: string = address.slice(SHORT_ADDRESS_SUFFIX_OFFSET);
    return `${prefix}...${suffix}`;
  }

  public buildAlertTmaDeeplink(walletId: number): string | null {
    const botUsernameRaw: string | null | undefined = this.appConfigService.tmaBotUsername;

    if (typeof botUsernameRaw !== 'string' || botUsernameRaw.trim().length === 0) {
      return null;
    }

    return `https://t.me/${botUsernameRaw.trim()}?startapp=wallet_${String(walletId)}`;
  }

  private buildWalletAppUrl(walletId: number): string | null {
    const baseUrl: string | null = this.resolveTmaBaseUrl();
    if (baseUrl === null) {
      return null;
    }
    return appendVersionQuery(
      `${baseUrl}/wallets/${String(walletId)}`,
      this.appConfigService.appVersion,
    );
  }

  private resolveTmaBaseUrl(): string | null {
    const configuredUrlRaw: string | null | undefined = this.appConfigService.tmaBaseUrl;
    if (typeof configuredUrlRaw !== 'string' || configuredUrlRaw.trim().length === 0) {
      return null;
    }
    return configuredUrlRaw.replace(/\/+$/, '');
  }

  private resolveTmaRootUrl(): string | null {
    const baseUrl: string | null = this.resolveTmaBaseUrl();

    if (baseUrl === null) {
      return null;
    }

    return appendVersionQuery(`${baseUrl}/`, this.appConfigService.appVersion);
  }
}
