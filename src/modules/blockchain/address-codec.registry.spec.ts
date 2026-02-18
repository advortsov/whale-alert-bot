import { describe, expect, it } from 'vitest';

import { AddressCodecRegistry } from './address-codec.registry';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import { EthereumAddressCodec } from '../chains/ethereum/ethereum-address.codec';
import { SolanaAddressCodec } from '../chains/solana/solana-address.codec';
import { TronAddressCodec } from '../chains/tron/tron-address.codec';

describe('AddressCodecRegistry', (): void => {
  it('returns ethereum codec for ethereum chain', (): void => {
    const registry: AddressCodecRegistry = new AddressCodecRegistry(
      new EthereumAddressCodec(),
      new SolanaAddressCodec(),
      new TronAddressCodec(),
    );

    const codec = registry.getCodec(ChainKey.ETHEREUM_MAINNET);

    expect(codec.normalize('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );
  });

  it('returns solana codec for solana chain', (): void => {
    const registry: AddressCodecRegistry = new AddressCodecRegistry(
      new EthereumAddressCodec(),
      new SolanaAddressCodec(),
      new TronAddressCodec(),
    );

    const codec = registry.getCodec(ChainKey.SOLANA_MAINNET);

    expect(codec.normalize('11111111111111111111111111111111')).toBe(
      '11111111111111111111111111111111',
    );
  });

  it('returns tron codec for tron chain', (): void => {
    const registry: AddressCodecRegistry = new AddressCodecRegistry(
      new EthereumAddressCodec(),
      new SolanaAddressCodec(),
      new TronAddressCodec(),
    );

    const codec = registry.getCodec(ChainKey.TRON_MAINNET);

    expect(codec.normalize('4174472e7d35395a6b5add427eecb7f4b62ad2b071')).toBe(
      'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    );
  });
});
