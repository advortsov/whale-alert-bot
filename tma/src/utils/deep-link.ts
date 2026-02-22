export interface IWalletDeepLink {
  readonly type: 'wallet';
  readonly id: number;
}

export const parseDeepLink = (rawStartParam: string | null): IWalletDeepLink | null => {
  if (rawStartParam === null) {
    return null;
  }

  const walletPrefix: string = 'wallet_';
  if (!rawStartParam.startsWith(walletPrefix)) {
    return null;
  }

  const idRaw: string = rawStartParam.slice(walletPrefix.length);
  const parsedId: number = Number.parseInt(idRaw, 10);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  return {
    type: 'wallet',
    id: parsedId,
  };
};
