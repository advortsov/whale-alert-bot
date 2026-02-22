import type { ApiClient } from './client';
import type { ITmaInitResult } from '../types/api.types';

export const loadTmaInit = async (apiClient: ApiClient): Promise<ITmaInitResult> => {
  return apiClient.request<ITmaInitResult>('GET', '/api/tma/init');
};
