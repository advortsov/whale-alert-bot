import React from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { loadWalletById, loadWalletHistory } from '../api/wallets';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import type { IWalletDetailDto, IWalletHistoryResult } from '../types/api.types';

const DEFAULT_HISTORY_OFFSET: number = 0;
const DEFAULT_HISTORY_LIMIT: number = 20;

export const WalletDetailPage = (): React.JSX.Element => {
  const params = useParams();
  const walletId: number = Number.parseInt(params.id ?? '', 10);
  const { apiClient, isReady } = useAuth();

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

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h1>Кошелёк #{walletQuery.data.walletId}</h1>
      <p>Chain: {walletQuery.data.chainKey}</p>
      <p>Address: {walletQuery.data.address}</p>
      <p>Label: {walletQuery.data.label ?? '-'}</p>

      <h2>History</h2>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {historyQuery.data.items.map((item) => (
          <li key={item.txHash}>
            {item.eventType} • {item.direction} • {item.amountText}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button">🔕 Mute 24h</button>
        <button type="button">⚙️ Filters</button>
        <button type="button">📜 History</button>
      </div>
      <Link to="/wallets">Назад</Link>
    </section>
  );
};
