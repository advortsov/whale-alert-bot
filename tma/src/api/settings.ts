import type { ApiClient } from './client';
import type { IUpdateSettingsRequest, IUserSettingsResult } from '../types/api.types';

export const loadSettings = async (apiClient: ApiClient): Promise<IUserSettingsResult> => {
  return apiClient.request<IUserSettingsResult>('GET', '/api/settings');
};

export const updateSettings = async (
  apiClient: ApiClient,
  payload: IUpdateSettingsRequest,
): Promise<IUserSettingsResult> => {
  return apiClient.request<IUserSettingsResult>('PATCH', '/api/settings', payload);
};
