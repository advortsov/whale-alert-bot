import type { ApiClient } from './client';
import type {
  IMuteWalletResult,
  ITrackWalletRequest,
  ITrackWalletResult,
  IUnmuteWalletResult,
  IWalletHistoryItem,
  IWalletDetailDto,
  IWalletHistoryResult,
  IWalletSummaryDto,
} from '../types/api.types';

interface IRawWalletHistoryResult {
  readonly items?: unknown;
  readonly nextOffset?: unknown;
  readonly hasNextPage?: unknown;
  readonly offset?: unknown;
  readonly limit?: unknown;
}

interface IRawWalletListResult {
  readonly wallets?: unknown;
  readonly totalCount?: unknown;
}

interface IRawWalletSummary {
  readonly walletId?: unknown;
  readonly id?: unknown;
  readonly chainKey?: unknown;
  readonly address?: unknown;
  readonly label?: unknown;
  readonly createdAt?: unknown;
}

interface IRawWalletDetail {
  readonly walletId?: unknown;
  readonly id?: unknown;
  readonly chainKey?: unknown;
  readonly address?: unknown;
  readonly label?: unknown;
  readonly activeMute?: unknown;
}

interface IRawTrackWalletResult {
  readonly walletId?: unknown;
  readonly id?: unknown;
  readonly address?: unknown;
  readonly label?: unknown;
  readonly chainKey?: unknown;
  readonly isNewSubscription?: unknown;
}

const EMPTY_ADDRESS_PLACEHOLDER = '—';
const UNKNOWN_CHAIN_KEY = 'unknown_chain';

const parseInteger = (rawValue: unknown): number | null => {
  if (typeof rawValue === 'number' && Number.isInteger(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string' && /^\d+$/.test(rawValue.trim())) {
    return Number.parseInt(rawValue, 10);
  }

  return null;
};

const normalizeWalletId = (rawWalletId: unknown, rawLegacyId: unknown): number => {
  const directWalletId: number | null = parseInteger(rawWalletId);
  const legacyWalletId: number | null = parseInteger(rawLegacyId);

  if (directWalletId !== null && directWalletId > 0) {
    return directWalletId;
  }

  if (legacyWalletId !== null && legacyWalletId > 0) {
    return legacyWalletId;
  }

  return 0;
};

const normalizeString = (rawValue: unknown, fallbackValue: string): string => {
  if (typeof rawValue !== 'string') {
    return fallbackValue;
  }

  const normalizedValue: string = rawValue.trim();
  return normalizedValue.length > 0 ? normalizedValue : fallbackValue;
};

const normalizeNullableString = (rawValue: unknown): string | null => {
  if (typeof rawValue !== 'string') {
    return null;
  }

  const normalizedValue: string = rawValue.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
};

const normalizeWalletSummary = (rawValue: unknown): IWalletSummaryDto | null => {
  if (typeof rawValue !== 'object' || rawValue === null) {
    return null;
  }

  const candidate = rawValue as IRawWalletSummary;
  const walletId: number = normalizeWalletId(candidate.walletId, candidate.id);

  if (walletId === 0) {
    return null;
  }

  const chainKey: string = normalizeString(candidate.chainKey, UNKNOWN_CHAIN_KEY);
  const address: string = normalizeString(candidate.address, EMPTY_ADDRESS_PLACEHOLDER);
  const createdAt: string = normalizeString(candidate.createdAt, '');

  return {
    walletId,
    chainKey,
    address,
    label: normalizeNullableString(candidate.label),
    createdAt,
  };
};

export const normalizeWalletDetail = (rawValue: unknown): IWalletDetailDto => {
  if (typeof rawValue !== 'object' || rawValue === null) {
    throw new Error('Wallet detail payload is malformed.');
  }

  const candidate = rawValue as IRawWalletDetail;
  const walletId: number = normalizeWalletId(candidate.walletId, candidate.id);

  if (walletId === 0) {
    throw new Error('Wallet detail payload does not contain valid walletId.');
  }

  return {
    walletId,
    chainKey: normalizeString(candidate.chainKey, UNKNOWN_CHAIN_KEY),
    address: normalizeString(candidate.address, EMPTY_ADDRESS_PLACEHOLDER),
    label: normalizeNullableString(candidate.label),
    activeMute: normalizeNullableString(candidate.activeMute),
  };
};

const normalizeTrackWalletResult = (rawValue: unknown): ITrackWalletResult => {
  if (typeof rawValue !== 'object' || rawValue === null) {
    throw new Error('Track wallet payload is malformed.');
  }

  const candidate = rawValue as IRawTrackWalletResult;
  const walletId: number = normalizeWalletId(candidate.walletId, candidate.id);

  if (walletId === 0) {
    throw new Error('Track wallet payload does not contain valid walletId.');
  }

  return {
    walletId,
    address: normalizeString(candidate.address, EMPTY_ADDRESS_PLACEHOLDER),
    label: normalizeNullableString(candidate.label),
    chainKey: normalizeString(candidate.chainKey, UNKNOWN_CHAIN_KEY),
    isNewSubscription: candidate.isNewSubscription !== false,
  };
};

const isStringValue = (rawValue: unknown): rawValue is string => {
  return typeof rawValue === 'string';
};

const isNullableStringValue = (rawValue: unknown): rawValue is string | null => {
  return typeof rawValue === 'string' || rawValue === null;
};

const isHistoryItem = (value: unknown): value is IWalletHistoryItem => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Partial<IWalletHistoryItem>;

  return (
    isStringValue(item.txHash) &&
    isStringValue(item.occurredAt) &&
    isStringValue(item.eventType) &&
    isStringValue(item.direction) &&
    isStringValue(item.amountText) &&
    isStringValue(item.txUrl) &&
    isNullableStringValue(item.assetSymbol) &&
    isStringValue(item.chainKey)
  );
};

export const normalizeWalletHistoryResult = (raw: unknown): IWalletHistoryResult => {
  if (typeof raw !== 'object' || raw === null) {
    return { items: [], nextOffset: null };
  }

  const candidate = raw as IRawWalletHistoryResult;
  const itemsRaw: unknown = candidate.items;
  const items: readonly IWalletHistoryItem[] = Array.isArray(itemsRaw)
    ? itemsRaw.filter((item: unknown): item is IWalletHistoryItem => isHistoryItem(item))
    : [];

  let nextOffset: number | null = parseInteger(candidate.nextOffset);

  if (nextOffset === null) {
    const hasNextPageRaw: unknown = candidate.hasNextPage;
    const offsetRaw: number | null = parseInteger(candidate.offset);
    const limitRaw: number | null = parseInteger(candidate.limit);
    if (hasNextPageRaw === true && offsetRaw !== null && limitRaw !== null) {
      nextOffset = offsetRaw + limitRaw;
    }
  }

  return {
    items,
    nextOffset,
  };
};

export const loadWallets = async (apiClient: ApiClient): Promise<readonly IWalletSummaryDto[]> => {
  const rawResult: unknown = await apiClient.request<unknown>('GET', '/api/wallets');

  if (typeof rawResult !== 'object' || rawResult === null) {
    return [];
  }

  const candidate = rawResult as IRawWalletListResult;
  const walletsRaw: unknown = candidate.wallets;

  if (!Array.isArray(walletsRaw)) {
    return [];
  }

  const wallets: IWalletSummaryDto[] = walletsRaw
    .map((item: unknown): IWalletSummaryDto | null => normalizeWalletSummary(item))
    .filter((item: IWalletSummaryDto | null): item is IWalletSummaryDto => item !== null);

  return wallets;
};

export const loadWalletById = async (
  apiClient: ApiClient,
  walletId: number,
): Promise<IWalletDetailDto> => {
  const rawResult: unknown = await apiClient.request<unknown>('GET', `/api/wallets/${walletId}`);
  return normalizeWalletDetail(rawResult);
};

export const loadWalletHistory = async (
  apiClient: ApiClient,
  walletId: number,
  offset: number,
  limit: number,
): Promise<IWalletHistoryResult> => {
  const queryParams: URLSearchParams = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });

  const rawResult: unknown = await apiClient.request<unknown>(
    'GET',
    `/api/wallets/${walletId}/history?${queryParams.toString()}`,
  );

  return normalizeWalletHistoryResult(rawResult);
};

export const addWallet = async (
  apiClient: ApiClient,
  request: ITrackWalletRequest,
): Promise<ITrackWalletResult> => {
  const rawResult: unknown = await apiClient.request<unknown>('POST', '/api/wallets', request);
  return normalizeTrackWalletResult(rawResult);
};

export const muteWallet = async (
  apiClient: ApiClient,
  walletId: number,
  minutes: number,
): Promise<IMuteWalletResult> => {
  return apiClient.request<IMuteWalletResult>('POST', `/api/wallets/${walletId}/mute`, {
    minutes,
  });
};

export const unmuteWallet = async (
  apiClient: ApiClient,
  walletId: number,
): Promise<IUnmuteWalletResult> => {
  return apiClient.request<IUnmuteWalletResult>('DELETE', `/api/wallets/${walletId}/mute`);
};
