import { describe, expect, it } from 'vitest';

import { SolanaAddressCodec } from './solana-address.codec';

describe('SolanaAddressCodec', (): void => {
  it('validates and normalizes solana address', (): void => {
    const codec: SolanaAddressCodec = new SolanaAddressCodec();
    const rawAddress: string = '11111111111111111111111111111111';

    expect(codec.validate(rawAddress)).toBe(true);
    expect(codec.normalize(rawAddress)).toBe(rawAddress);
  });

  it('rejects malformed solana address', (): void => {
    const codec: SolanaAddressCodec = new SolanaAddressCodec();

    expect(codec.validate('solana-address')).toBe(false);
    expect(codec.normalize('solana-address')).toBeNull();
  });
});
