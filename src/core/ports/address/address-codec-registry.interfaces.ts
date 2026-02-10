import type { IAddressCodec } from './address-codec.interfaces';
import type { ChainKey } from '../../chains/chain-key.interfaces';

export interface IAddressCodecRegistry {
  getCodec(chainKey: ChainKey): IAddressCodec;
}
