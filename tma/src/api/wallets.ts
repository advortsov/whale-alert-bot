import type { ApiClient } from './client';
import type {
  IMuteWalletResult,
  ITrackWalletRequest,
  ITrackWalletResult,
  IUnmuteWalletResult,
  IWalletHistoryItem,
  IWalletDetailDto,
  IWalletHistoryResult,
  IWalletListResult,
  IWalletSummaryDto,
} from '../types/api.types';

interface IRawWalletHistoryResult {
  readonly items?: unknown;
  readonly nextOffset?: unknown;
}

const isHistoryItem = (value: unknown): value is IWalletHistoryItem => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item['txHash'] === 'string' &&
    typeof item['occurredAt'] === 'string' &&
    typeof item['eventType'] === 'string' &&
    typeof item['direction'] === 'string' &&
    typeof item['amountText'] === 'string'
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

  const nextOffsetRaw: unknown = candidate.nextOffset;
  const nextOffset: number | null =
    typeof nextOffsetRaw === 'number' && Number.isInteger(nextOffsetRaw) ? nextOffsetRaw : null;

  return {
    items,
    nextOffset,
  };
};

export const loadWallets = async (
  apiClient: ApiClient,
): Promise<readonly IWalletSummaryDto[]> => {
  const result: IWalletListResult = await apiClient.request<IWalletListResult>('GET', '/api/wallets');
  return result.wallets;
};

export const loadWalletById = async (
  apiClient: ApiClient,
  walletId: number,
): Promise<IWalletDetailDto> => {
  return apiClient.request<IWalletDetailDto>('GET', `/api/wallets/${walletId}`);
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
  return apiClient.request<ITrackWalletResult>('POST', '/api/wallets', request);
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
