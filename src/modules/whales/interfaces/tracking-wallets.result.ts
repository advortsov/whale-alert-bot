import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { WalletEventHistoryView } from '../../../database/repositories/wallet-events.repository.interfaces';
import type {
  UserAlertPreferences,
  UserAlertSettingsSnapshot,
} from '../entities/tracking.interfaces';

export interface ITrackWalletResult {
  readonly walletId: number;
  readonly address: string;
  readonly label: string | null;
  readonly chainKey: ChainKey;
  readonly isNewSubscription: boolean;
}

export interface IWalletSummary {
  readonly walletId: number;
  readonly address: string;
  readonly label: string | null;
  readonly chainKey: ChainKey;
  readonly createdAt: Date;
}

export interface IWalletListResult {
  readonly wallets: readonly IWalletSummary[];
  readonly totalCount: number;
}

export interface IWalletDetailResult {
  readonly walletId: number;
  readonly address: string;
  readonly label: string | null;
  readonly chainKey: ChainKey;
  readonly globalPreferences: UserAlertPreferences;
  readonly walletPreferences: {
    readonly allowTransfer: boolean;
    readonly allowSwap: boolean;
    readonly hasOverride: boolean;
  } | null;
  readonly settings: UserAlertSettingsSnapshot;
  readonly activeMute: Date | null;
  readonly recentEvents: readonly WalletEventHistoryView[];
}

export interface IUntrackResult {
  readonly walletId: number;
  readonly address: string;
  readonly chainKey: ChainKey;
}

export interface IMuteWalletResult {
  readonly walletId: number;
  readonly mutedUntil: Date;
}
