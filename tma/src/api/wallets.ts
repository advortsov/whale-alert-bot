import type { ApiClient } from './client';
import type {
  ITrackWalletRequest,
  ITrackWalletResult,
  IWalletDetailDto,
  IWalletHistoryResult,
  IWalletListResult,
  IWalletSummaryDto,
} from '../types/api.types';

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

  return apiClient.request<IWalletHistoryResult>(
    'GET',
    `/api/wallets/${walletId}/history?${queryParams.toString()}`,
  );
};

export const addWallet = async (
  apiClient: ApiClient,
  request: ITrackWalletRequest,
): Promise<ITrackWalletResult> => {
  return apiClient.request<ITrackWalletResult>('POST', '/api/wallets', request);
};
