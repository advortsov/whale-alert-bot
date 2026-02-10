import { describe, expect, it } from 'vitest';

import { TronAddressCodec } from './tron-address.codec';

describe('TronAddressCodec', (): void => {
  it('validates and normalizes base58 tron address', (): void => {
    const codec: TronAddressCodec = new TronAddressCodec();
    const rawAddress: string = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';

    expect(codec.validate(rawAddress)).toBe(true);
    expect(codec.normalize(rawAddress)).toBe(rawAddress);
  });

  it('normalizes tron hex address to base58', (): void => {
    const codec: TronAddressCodec = new TronAddressCodec();
    const rawHexAddress: string = '4174472e7d35395a6b5add427eecb7f4b62ad2b071';

    expect(codec.validate(rawHexAddress)).toBe(true);
    expect(codec.normalize(rawHexAddress)).toBe('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');
  });

  it('rejects malformed tron address', (): void => {
    const codec: TronAddressCodec = new TronAddressCodec();

    expect(codec.validate('tron-address')).toBe(false);
    expect(codec.normalize('tron-address')).toBeNull();
  });
});
