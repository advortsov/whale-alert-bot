import type { ChainKey } from '../../common/interfaces/chain-key.interfaces';

export interface IUpsertAlertMuteInput {
  readonly userId: number;
  readonly chainKey: ChainKey;
  readonly walletId: number;
  readonly muteUntil: Date;
  readonly source: string;
}
