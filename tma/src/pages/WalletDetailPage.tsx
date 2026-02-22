import React from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { loadWalletById, loadWalletHistory, muteWallet, unmuteWallet } from '../api/wallets';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import type { IWalletDetailDto, IWalletHistoryResult } from '../types/api.types';

const DEFAULT_HISTORY_OFFSET: number = 0;
const DEFAULT_HISTORY_LIMIT: number = 20;

export const WalletDetailPage = (): React.JSX.Element => {
  const params = useParams();
  const walletId: number = Number.parseInt(params.id ?? '', 10);
  const { apiClient, isReady } = useAuth();
  const queryClient = useQueryClient();
  const [actionStatus, setActionStatus] = React.useState<string | null>(null);

  const walletQuery: UseQueryResult<IWalletDetailDto> = useQuery<IWalletDetailDto>({
    queryKey: ['wallet', walletId],
    queryFn: async (): Promise<IWalletDetailDto> => {
      return loadWalletById(apiClient, walletId);
    },
    enabled: isReady && Number.isInteger(walletId),
  });

  const historyQuery: UseQueryResult<IWalletHistoryResult> = useQuery<IWalletHistoryResult>({
    queryKey: ['wallet-history', walletId],
    queryFn: async (): Promise<IWalletHistoryResult> => {
      return loadWalletHistory(apiClient, walletId, DEFAULT_HISTORY_OFFSET, DEFAULT_HISTORY_LIMIT);
    },
    enabled: isReady && Number.isInteger(walletId),
  });

  const muteMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await muteWallet(apiClient, walletId, 24 * 60);
    },
    onSuccess: async (): Promise<void> => {
      setActionStatus('Кошелёк замьючен на 24 часа.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallet', walletId] }),
        queryClient.invalidateQueries({ queryKey: ['wallets'] }),
        queryClient.invalidateQueries({ queryKey: ['tma-init'] }),
      ]);
    },
    onError: (error: unknown): void => {
      const message: string =
        error instanceof Error ? error.message : 'Не удалось применить mute.';
      setActionStatus(message);
    },
  });

  const unmuteMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await unmuteWallet(apiClient, walletId);
    },
    onSuccess: async (): Promise<void> => {
      setActionStatus('Mute снят.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallet', walletId] }),
        queryClient.invalidateQueries({ queryKey: ['wallets'] }),
        queryClient.invalidateQueries({ queryKey: ['tma-init'] }),
      ]);
    },
    onError: (error: unknown): void => {
      const message: string =
        error instanceof Error ? error.message : 'Не удалось снять mute.';
      setActionStatus(message);
    },
  });

  if (!Number.isInteger(walletId)) {
    return <p>Некорректный id кошелька.</p>;
  }

  if (walletQuery.isLoading || historyQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (
    walletQuery.isError ||
    historyQuery.isError ||
    walletQuery.data === undefined ||
    historyQuery.data === undefined
  ) {
    return <p>Не удалось загрузить карточку кошелька.</p>;
  }

  const isMuted: boolean = walletQuery.data.activeMute !== null;
  const isActionPending: boolean = muteMutation.isPending || unmuteMutation.isPending;

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h1>Кошелёк #{walletQuery.data.walletId}</h1>
      <p>Chain: {walletQuery.data.chainKey}</p>
      <p>Address: {walletQuery.data.address}</p>
      <p>Label: {walletQuery.data.label ?? '-'}</p>
      <p>
        Mute: {walletQuery.data.activeMute === null ? 'off' : walletQuery.data.activeMute}
      </p>

      <h2>History</h2>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {historyQuery.data.items.map((item) => (
          <li key={item.txHash}>
            {item.eventType} • {item.direction} • {item.amountText}
          </li>
        ))}
      </ul>

      {actionStatus === null ? null : <p>{actionStatus}</p>}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          disabled={isActionPending}
          onClick={(): void => {
            if (isMuted) {
              unmuteMutation.mutate();
              return;
            }

            muteMutation.mutate();
          }}
        >
          {isMuted ? '🔔 Unmute' : '🔕 Mute 24h'}
        </button>
        <button type="button">⚙️ Filters</button>
        <button type="button">📜 History</button>
      </div>
      <Link to="/wallets">Назад</Link>
    </section>
  );
};
