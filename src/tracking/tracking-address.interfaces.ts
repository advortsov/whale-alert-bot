import { type ChainKey } from '../core/chains/chain-key.interfaces';

export interface INormalizedAddressCandidate {
  readonly chainKey: ChainKey;
  readonly address: string;
}

export interface IResolvedTrackedWalletSubscription {
  readonly walletId: number;
  readonly chainKey: ChainKey;
  readonly walletAddress: string;
  readonly walletLabel: string | null;
}

export interface IResolvedHistoryTarget {
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly walletId: number | null;
}
