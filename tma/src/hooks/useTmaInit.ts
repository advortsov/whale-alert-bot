import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useAuth } from './useAuth';
import { loadTmaInit } from '../api/init';
import type { ITmaInitResult } from '../types/api.types';

export const useTmaInit = (): UseQueryResult<ITmaInitResult> => {
  const { apiClient, isReady, authError } = useAuth();

  return useQuery<ITmaInitResult>({
    queryKey: ['tma-init'],
    queryFn: async (): Promise<ITmaInitResult> => {
      return loadTmaInit(apiClient);
    },
    enabled: isReady && authError === null,
  });
};
