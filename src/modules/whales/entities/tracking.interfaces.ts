import type { AlertCexFlowMode } from './cex-flow.interfaces';
import type { AlertSmartFilterType } from './smart-filter.interfaces';
import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';

export type TelegramUserRef = {
  readonly telegramId: string;
  readonly username: string | null;
};

export type TrackedWalletOption = {
  readonly walletId: number;
  readonly walletAddress: string;
  readonly walletLabel: string | null;
};

export enum AlertFilterToggleTarget {
  TRANSFER = 'transfer',
  SWAP = 'swap',
}

export type UserAlertPreferences = {
  readonly minAmount: number;
  readonly allowTransfer: boolean;
  readonly allowSwap: boolean;
  readonly mutedUntil: Date | null;
};

export type UserAlertSettingsSnapshot = {
  readonly thresholdUsd: number;
  readonly minAmountUsd: number;
  readonly cexFlowMode: AlertCexFlowMode;
  readonly smartFilterType: AlertSmartFilterType;
  readonly includeDexes: readonly string[];
  readonly excludeDexes: readonly string[];
  readonly quietHoursFrom: string | null;
  readonly quietHoursTo: string | null;
  readonly timezone: string;
};

export type WalletAlertFilterState = {
  readonly walletId: number;
  readonly walletAddress: string;
  readonly walletLabel: string | null;
  readonly chainKey: ChainKey;
  readonly allowTransfer: boolean;
  readonly allowSwap: boolean;
  readonly hasWalletOverride: boolean;
};
