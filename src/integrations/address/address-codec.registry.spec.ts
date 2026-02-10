import { describe, expect, it } from 'vitest';

import { AddressCodecRegistry } from './address-codec.registry';
import { EthereumAddressCodec } from './ethereum/ethereum-address.codec';
import { SolanaAddressCodec } from './solana/solana-address.codec';
import { ChainKey } from '../../core/chains/chain-key.interfaces';

describe('AddressCodecRegistry', (): void => {
  it('returns ethereum codec for ethereum chain', (): void => {
    const registry: AddressCodecRegistry = new AddressCodecRegistry(
      new EthereumAddressCodec(),
      new SolanaAddressCodec(),
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
    );

    const codec = registry.getCodec(ChainKey.SOLANA_MAINNET);

    expect(codec.normalize('11111111111111111111111111111111')).toBe(
      '11111111111111111111111111111111',
    );
  });
});
