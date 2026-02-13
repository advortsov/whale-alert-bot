import { type ChainKey } from '../core/chains/chain-key.interfaces';

export interface IParsedTrackArgs {
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly label: string | null;
}
