import type { Context } from 'telegraf';

import type {
  HistoryDirectionFilter,
  HistoryKind,
} from '../features/tracking/dto/history-request.dto';

export enum SupportedTelegramCommand {
  START = 'start',
  HELP = 'help',
  TRACK = 'track',
  LIST = 'list',
  UNTRACK = 'untrack',
  HISTORY = 'history',
  WALLET = 'wallet',
  STATUS = 'status',
  FILTER = 'filter',
  THRESHOLD = 'threshold',
  FILTERS = 'filters',
  WALLET_FILTERS = 'walletfilters',
  WALLET_FILTER = 'wfilter',
  QUIET = 'quiet',
  TZ = 'tz',
  MUTE = 'mute',
  TRACK_HINT = 'track_hint',
  HISTORY_HINT = 'history_hint',
  UNTRACK_HINT = 'untrack_hint',
}

export type ParsedMessageCommand = {
  readonly command: SupportedTelegramCommand;
  readonly args: readonly string[];
  readonly lineNumber: number;
};

export type ReplyOptions = NonNullable<Parameters<Context['reply']>[1]>;

export type CommandExecutionResult = {
  readonly lineNumber: number;
  readonly message: string;
  readonly replyOptions: ReplyOptions | null;
};

export type UpdateMeta = {
  readonly updateId: number | null;
  readonly chatId: string | null;
  readonly messageId: number | null;
};

export enum WalletCallbackTargetType {
  WALLET_ID = 'wallet_id',
  ADDRESS = 'address',
}

export enum WalletCallbackAction {
  MENU = 'menu',
  HISTORY = 'history',
  UNTRACK = 'untrack',
  MUTE = 'mute',
  FILTERS = 'filters',
  IGNORE_24H = 'ignore_24h',
}

export enum WalletCallbackFilterTarget {
  TRANSFER = 'transfer',
  SWAP = 'swap',
}

export type WalletCallbackTarget = {
  readonly action: WalletCallbackAction;
  readonly targetType: WalletCallbackTargetType;
  readonly walletId: number | null;
  readonly walletAddress: string | null;
  readonly muteMinutes: number | null;
  readonly historyOffset: number | null;
  readonly historyLimit: number | null;
  readonly historyKind: HistoryKind | null;
  readonly historyDirection: HistoryDirectionFilter | null;
  readonly filterTarget: WalletCallbackFilterTarget | null;
  readonly filterEnabled: boolean | null;
};
