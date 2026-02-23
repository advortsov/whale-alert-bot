import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface IQueryProviderProps {
  readonly children: React.ReactNode;
}

const QUERY_STALE_TIME_MS = 60_000;
const QUERY_GC_TIME_MS = 600_000;
const QUERY_RETRY_COUNT = 1;

export const QueryProvider = ({ children }: IQueryProviderProps): React.JSX.Element => {
  const [queryClient] = useState<QueryClient>(
    (): QueryClient =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: QUERY_STALE_TIME_MS,
            gcTime: QUERY_GC_TIME_MS,
            retry: QUERY_RETRY_COUNT,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
