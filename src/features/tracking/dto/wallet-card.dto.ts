import type { ChainKey } from '../../../core/chains/chain-key.interfaces';

export interface WalletCardDto {
  readonly walletId: number;
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly label: string | null;
  readonly allowTransfer: boolean;
  readonly allowSwap: boolean;
  readonly mutedUntil: Date | null;
  readonly latestEventsSummary: readonly string[];
}
