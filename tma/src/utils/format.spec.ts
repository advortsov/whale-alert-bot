import { describe, expect, it } from 'vitest';

import { formatShortAddress } from './format';

describe('formatShortAddress', (): void => {
  it('returns placeholder for undefined address', (): void => {
    expect(formatShortAddress(undefined)).toBe('—');
  });

  it('returns unchanged short address', (): void => {
    expect(formatShortAddress('0x1234')).toBe('0x1234');
  });

  it('shortens long address', (): void => {
    expect(formatShortAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe('0xd8dA...6045');
  });
});
