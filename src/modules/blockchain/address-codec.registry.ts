import { Injectable } from '@nestjs/common';

import type { IAddressCodecRegistry } from '../../common/interfaces/address/address-codec-registry.interfaces';
import type { IAddressCodec } from '../../common/interfaces/address/address-codec.interfaces';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import { EthereumAddressCodec } from '../../integrations/address/ethereum/ethereum-address.codec';
import { SolanaAddressCodec } from '../../integrations/address/solana/solana-address.codec';
import { TronAddressCodec } from '../../integrations/address/tron/tron-address.codec';

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
