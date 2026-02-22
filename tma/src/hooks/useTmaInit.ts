import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { loadTmaInit } from '../api/init';
import type { ITmaInitResult } from '../types/api.types';
import { useAuth } from './useAuth';

export const useTmaInit = (): UseQueryResult<ITmaInitResult> => {
  const { apiClient, isReady } = useAuth();

  return useQuery<ITmaInitResult>({
    queryKey: ['tma-init'],
    queryFn: async (): Promise<ITmaInitResult> => {
      return loadTmaInit(apiClient);
    },
    enabled: isReady,
  });
};
