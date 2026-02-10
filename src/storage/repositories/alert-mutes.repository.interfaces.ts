import type { ChainKey } from '../../core/chains/chain-key.interfaces';

export interface UpsertAlertMuteInput {
  readonly userId: number;
  readonly chainKey: ChainKey;
  readonly walletId: number;
  readonly muteUntil: Date;
  readonly source: string;
}
