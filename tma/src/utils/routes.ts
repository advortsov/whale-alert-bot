const WALLET_DETAILS_ROUTE_PREFIX = '/wallets/';
const HISTORY_HASH_SUFFIX = '#history';

export const buildWalletDetailsRoute = (walletId: number): string => {
  return `${WALLET_DETAILS_ROUTE_PREFIX}${walletId}`;
};

export const buildWalletHistoryRoute = (walletId: number): string => {
  return `${buildWalletDetailsRoute(walletId)}${HISTORY_HASH_SUFFIX}`;
};
