import { getAddress } from 'ethers';

const ETHEREUM_ADDRESS_PATTERN: RegExp = /^0x[a-fA-F0-9]{40}$/;

export const isEthereumAddressCandidate = (rawAddress: string): boolean => {
  return ETHEREUM_ADDRESS_PATTERN.test(rawAddress.trim());
};

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
