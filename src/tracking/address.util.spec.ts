import { normalizeEthereumAddress, tryNormalizeEthereumAddress } from './address.util';

describe('address util', (): void => {
  it('normalizes valid ethereum address', (): void => {
    const result: string = normalizeEthereumAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');

    expect(result).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  });

  it('returns null for invalid address in safe normalize', (): void => {
    const result: string | null = tryNormalizeEthereumAddress('invalid-address');

    expect(result).toBeNull();
  });
});
