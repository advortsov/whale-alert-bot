import type { ApiClient } from './client';
import type {
  ITrackWalletRequest,
  IWalletHistoryResult,
  IWalletItem,
  IWalletListResult,
} from '../types/api.types';

export const loadWallets = async (apiClient: ApiClient): Promise<readonly IWalletItem[]> => {
  const result: IWalletListResult = await apiClient.request<IWalletListResult>('GET', '/api/wallets');
  return result.wallets;
};

export const loadWalletById = async (apiClient: ApiClient, walletId: number): Promise<IWalletItem> => {
  return apiClient.request<IWalletItem>('GET', `/api/wallets/${walletId}`);
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

  return apiClient.request<IWalletHistoryResult>(
    'GET',
    `/api/wallets/${walletId}/history?${queryParams.toString()}`,
  );
};

export const addWallet = async (
  apiClient: ApiClient,
  request: ITrackWalletRequest,
): Promise<IWalletItem> => {
  return apiClient.request<IWalletItem>('POST', '/api/wallets', request);
};
