import { Injectable } from '@nestjs/common';

import { EthereumAddressCodec } from './ethereum/ethereum-address.codec';
import { SolanaAddressCodec } from './solana/solana-address.codec';
import { TronAddressCodec } from './tron/tron-address.codec';
import type { IAddressCodecRegistry } from '../../common/interfaces/address/address-codec-registry.interfaces';
import type { IAddressCodec } from '../../common/interfaces/address/address-codec.interfaces';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';

@Injectable()
export class AddressCodecRegistry implements IAddressCodecRegistry {
  public constructor(
    private readonly ethereumAddressCodec: EthereumAddressCodec,
    private readonly solanaAddressCodec: SolanaAddressCodec,
    private readonly tronAddressCodec: TronAddressCodec,
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
