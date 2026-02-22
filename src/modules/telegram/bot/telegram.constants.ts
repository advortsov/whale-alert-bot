import { SupportedTelegramCommand, WalletCallbackFilterTarget } from './telegram.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { AlertFilterToggleTarget } from '../../whales/entities/tracking.interfaces';

export const USER_NOT_IDENTIFIED_MESSAGE = 'Не удалось определить пользователя.';
export const DEFAULT_MUTE_MINUTES = 30;
export const MUTE_24H_MINUTES = 1440;
export const FILTER_TOGGLE_PARTS_COUNT = 3;
export const HISTORY_NAV_MIN_PARTS_COUNT = 3;
export const HISTORY_NAV_EXTENDED_PARTS_COUNT = 5;
export const HISTORY_BUTTON_MIN_PARTS_COUNT = 2;
export const HISTORY_BUTTON_EXTENDED_PARTS_COUNT = 4;
export const WALLET_BUTTON_TITLE_MAX_LENGTH = 21;
export const ELLIPSIS_LENGTH = 3;
export const SHORT_ADDRESS_PREFIX_LENGTH = 8;
export const SHORT_ADDRESS_SUFFIX_OFFSET = -6;
export const CALLBACK_HISTORY_LIMIT: number = 10;

export const SUPPORTED_COMMAND_MAP: Readonly<Record<string, SupportedTelegramCommand>> = {
  start: SupportedTelegramCommand.START,
  app: SupportedTelegramCommand.APP,
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

export const MENU_BUTTON_COMMAND_MAP: Readonly<Record<string, SupportedTelegramCommand>> = {
  '🏠 Главное меню': SupportedTelegramCommand.START,
  '📱 Приложение': SupportedTelegramCommand.APP,
  '🚀 Mini App': SupportedTelegramCommand.APP,
  '➕ Добавить адрес': SupportedTelegramCommand.TRACK_HINT,
  '📋 Мой список': SupportedTelegramCommand.LIST,
  '📈 Статус': SupportedTelegramCommand.STATUS,
  '📜 История': SupportedTelegramCommand.HISTORY_HINT,
  '⚙️ Фильтры': SupportedTelegramCommand.FILTERS,
  '🗑 Удалить адрес': SupportedTelegramCommand.UNTRACK_HINT,
  '❓ Помощь': SupportedTelegramCommand.HELP,
};

export const ALERT_FILTER_TARGET_MAP: Readonly<Record<string, AlertFilterToggleTarget>> = {
  transfer: AlertFilterToggleTarget.TRANSFER,
  swap: AlertFilterToggleTarget.SWAP,
};

export const WALLET_FILTER_TARGET_MAP: Readonly<Record<string, WalletCallbackFilterTarget>> = {
  transfer: WalletCallbackFilterTarget.TRANSFER,
  swap: WalletCallbackFilterTarget.SWAP,
};

export const TRACK_CHAIN_ALIAS_MAP: Readonly<Record<string, ChainKey>> = {
  eth: ChainKey.ETHEREUM_MAINNET,
  ethereum: ChainKey.ETHEREUM_MAINNET,
  sol: ChainKey.SOLANA_MAINNET,
  solana: ChainKey.SOLANA_MAINNET,
  tron: ChainKey.TRON_MAINNET,
  trx: ChainKey.TRON_MAINNET,
};

export const WALLET_HISTORY_CALLBACK_PREFIX: string = 'wallet_history:';
export const WALLET_HISTORY_PAGE_CALLBACK_PREFIX: string = 'wallet_history_page:';
export const WALLET_HISTORY_REFRESH_CALLBACK_PREFIX: string = 'wallet_history_refresh:';
export const WALLET_MENU_CALLBACK_PREFIX: string = 'wallet_menu:';
export const WALLET_UNTRACK_CALLBACK_PREFIX: string = 'wallet_untrack:';
export const WALLET_MUTE_CALLBACK_PREFIX: string = 'wallet_mute:';
export const WALLET_FILTERS_CALLBACK_PREFIX: string = 'wallet_filters:';
export const WALLET_FILTER_TOGGLE_CALLBACK_PREFIX: string = 'wallet_filter_toggle:';
export const ALERT_IGNORE_CALLBACK_PREFIX: string = 'alert_ignore_24h:';
