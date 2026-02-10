import { describe, expect, it } from 'vitest';

import { EthereumAddressCodec } from './ethereum-address.codec';

describe('EthereumAddressCodec', (): void => {
  it('validates and normalizes ethereum address', (): void => {
    const codec: EthereumAddressCodec = new EthereumAddressCodec();
    const rawAddress: string = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

    expect(codec.validate(rawAddress)).toBe(true);
    expect(codec.normalize(rawAddress)).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  });

  it('rejects malformed ethereum address', (): void => {
    const codec: EthereumAddressCodec = new EthereumAddressCodec();

    expect(codec.validate('0x12345')).toBe(false);
    expect(codec.normalize('0x12345')).toBeNull();
  });
});
