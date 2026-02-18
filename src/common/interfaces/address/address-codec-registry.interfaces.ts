import type { IAddressCodec } from './address-codec.interfaces';
import type { ChainKey } from '../chain-key.interfaces';

export interface IAddressCodecRegistry {
  getCodec(chainKey: ChainKey): IAddressCodec;
}
