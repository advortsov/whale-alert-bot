import { describe, expect, it } from 'vitest';

import { buildWalletDetailsRoute, buildWalletHistoryRoute } from './routes';

describe('routes helpers', (): void => {
  it('builds wallet details route from walletId', (): void => {
    expect(buildWalletDetailsRoute(42)).toBe('/wallets/42');
  });

  it('builds wallet history route with anchor from walletId', (): void => {
    expect(buildWalletHistoryRoute(42)).toBe('/wallets/42#history');
  });
});
