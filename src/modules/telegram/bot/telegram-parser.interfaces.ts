import { type ChainKey } from '../../../common/interfaces/chain-key.interfaces';

export interface IParsedTrackArgs {
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly label: string | null;
}
