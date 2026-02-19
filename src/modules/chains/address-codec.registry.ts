import { Inject } from '@nestjs/common';

import type { EthereumAddressCodec } from './ethereum/ethereum-address.codec';
import type { SolanaAddressCodec } from './solana/solana-address.codec';
import type { TronAddressCodec } from './tron/tron-address.codec';
import type { IAddressCodecRegistry } from '../../common/interfaces/address/address-codec-registry.interfaces';
import type { IAddressCodec } from '../../common/interfaces/address/address-codec.interfaces';
import {
  ETHEREUM_ADDRESS_CODEC,
  SOLANA_ADDRESS_CODEC,
  TRON_ADDRESS_CODEC,
} from '../../common/interfaces/address/address-port.tokens';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';

export class AddressCodecRegistry implements IAddressCodecRegistry {
  constructor(
    @Inject(ETHEREUM_ADDRESS_CODEC) private readonly ethereumAddressCodec: EthereumAddressCodec,
    @Inject(SOLANA_ADDRESS_CODEC) private readonly solanaAddressCodec: SolanaAddressCodec,
    @Inject(TRON_ADDRESS_CODEC) private readonly tronAddressCodec: TronAddressCodec,
  ) {}

  public getCodec(chainKey: ChainKey): IAddressCodec {
    if (chainKey === ChainKey.ETHEREUM_MAINNET) {
      return this.ethereumAddressCodec;
    }

    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return this.solanaAddressCodec;
    }

    return this.tronAddressCodec;
  }
}
