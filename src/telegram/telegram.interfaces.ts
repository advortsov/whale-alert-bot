import type { Context } from 'telegraf';

export enum SupportedTelegramCommand {
  START = 'start',
  HELP = 'help',
  TRACK = 'track',
  LIST = 'list',
  UNTRACK = 'untrack',
  HISTORY = 'history',
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

export type WalletHistoryCallbackTarget =
  | {
      readonly targetType: 'wallet_id';
      readonly walletId: number;
    }
  | {
      readonly targetType: 'address';
      readonly walletAddress: string;
    };
