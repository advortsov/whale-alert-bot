import { getAddress } from 'ethers';

export const normalizeEthereumAddress = (rawAddress: string): string => {
  return getAddress(rawAddress.trim());
};

export const tryNormalizeEthereumAddress = (rawAddress: string): string | null => {
  try {
    return normalizeEthereumAddress(rawAddress);
  } catch {
    return null;
  }
};
