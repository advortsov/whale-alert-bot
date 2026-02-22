import type { ApiClient } from './client';
import type {
  IMuteWalletResult,
  ITrackWalletRequest,
  ITrackWalletResult,
  IUnmuteWalletResult,
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
