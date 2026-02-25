import type { ClassifiedEvent } from '../../../common/interfaces/chain.types';
import type { WalletEventHistoryView } from '../../../database/repositories/wallet-events.repository.interfaces';
import type { IHistoryItemDto } from '../entities/history-item.dto';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

const parseBigIntSafe = (rawValue: string | null): bigint | null => {
  if (typeof rawValue !== 'string') {
    return null;
  }

  const normalizedValue: string = rawValue.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  try {
    return BigInt(normalizedValue);
  } catch {
    return null;
  }
};

const parseFloatSafe = (rawValue: string | null): number | null => {
  if (typeof rawValue !== 'string') {
    return null;
  }

  const normalizedValue: string = rawValue.trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  const parsedValue: number = Number.parseFloat(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const isParsedNumberZero = (value: number | null): boolean => {
  if (value === null) {
    return false;
  }

  return Math.abs(value) === 0;
};

export const isZeroBigIntString = (rawValue: string | null): boolean => {
  const parsedValue: bigint | null = parseBigIntSafe(rawValue);
  return parsedValue !== null && parsedValue === BigInt(0);
};

export const isZeroClassifiedEvent = (event: ClassifiedEvent): boolean => {
  if (isZeroBigIntString(event.tokenAmountRaw)) {
    return true;
  }

  if (isParsedNumberZero(parseFloatSafe(event.valueFormatted))) {
    return true;
  }

  const swapFromAmount: number | null = parseFloatSafe(event.swapFromAmountText);
  const swapToAmount: number | null = parseFloatSafe(event.swapToAmountText);

  if (swapFromAmount !== null || swapToAmount !== null) {
    return (swapFromAmount ?? 0) === 0 && (swapToAmount ?? 0) === 0;
  }

  return false;
};

export const isZeroWalletEventHistory = (event: WalletEventHistoryView): boolean => {
  if (isZeroBigIntString(event.tokenAmountRaw)) {
    return true;
  }

  if (isParsedNumberZero(parseFloatSafe(event.valueFormatted))) {
    return true;
  }

  return false;
};

export const isZeroExplorerHistoryItem = (item: IHistoryItemDto): boolean => {
  return isZeroBigIntString(item.valueRaw);
};

export const parseAmountFromHistoryItem = (item: IWalletHistoryListItem): number | null => {
  const amountMatch: RegExpExecArray | null = /^([-+]?\d+(?:\.\d+)?)/.exec(item.amountText.trim());

  if (amountMatch === null || typeof amountMatch[1] !== 'string') {
    return null;
  }

  const parsedAmount: number = Number.parseFloat(amountMatch[1]);

  if (!Number.isFinite(parsedAmount)) {
    return null;
  }

  return Math.abs(parsedAmount);
};

export const extractTimestampSec = (occurredAtIso: string): number | null => {
  const occurredAtMs: number = Date.parse(occurredAtIso);

  if (!Number.isFinite(occurredAtMs)) {
    return null;
  }

  return Math.floor(occurredAtMs / 1000);
};

export const normalizeTokenAddressForPricing = (tokenAddress: string | null): string | null => {
  if (tokenAddress === null) {
    return null;
  }

  const normalizedTokenAddress: string = tokenAddress.trim();

  if (normalizedTokenAddress.length === 0) {
    return null;
  }

  return normalizedTokenAddress;
};
