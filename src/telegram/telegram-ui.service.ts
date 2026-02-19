import { Injectable } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';

import {
  CALLBACK_HISTORY_LIMIT,
  ELLIPSIS_LENGTH,
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
import type { HistoryPageResult } from '../modules/whales/entities/history-page.interfaces';
import {
  HistoryDirectionFilter,
  HistoryKind,
} from '../modules/whales/entities/history-request.dto';
import type {
  TrackedWalletOption,
  WalletAlertFilterState,
} from '../modules/whales/entities/tracking.interfaces';

@Injectable()
export class TelegramUiService {
  public buildStartMessage(): string {
    return [
      'Whale Alert Bot готов к работе.',
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

  public buildHistoryHintMessage(): string {
    return [
      'История транзакций:',
      '/history <address|#id> [limit]',
      'Примеры:',
      '/history #1 10',
      '/history 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 5',
      '/history 11111111111111111111111111111111 5',
      '/history TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 5',
    ].join('\n');
  }

  public buildUntrackHintMessage(): string {
    return [
      'Удаление адреса:',
      '/untrack <address|id>',
      'Примеры:',
      '/untrack #1',
      '/untrack 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      '/untrack 11111111111111111111111111111111',
      '/untrack TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    ].join('\n');
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

  public buildReplyOptions(): ReplyOptions {
    return Markup.keyboard([
      ['🏠 Главное меню', '📋 Мой список', '📈 Статус'],
      ['➕ Добавить адрес', '📜 История', '⚙️ Фильтры'],
      ['🗑 Удалить адрес'],
      ['❓ Помощь'],
    ])
      .resize()
      .persistent();
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

  public buildWalletActionInlineKeyboard(walletId: number): ReplyOptions {
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
}
