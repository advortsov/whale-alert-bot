import React from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { loadWallets } from '../api/wallets';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { WalletCard } from '../components/WalletCard';
import { useAuth } from '../hooks/useAuth';
import type { IWalletItem } from '../types/api.types';

export const WalletsPage = (): React.JSX.Element => {
  const { apiClient, isReady } = useAuth();
  const walletsQuery: UseQueryResult<readonly IWalletItem[]> = useQuery<readonly IWalletItem[]>({
    queryKey: ['wallets'],
    queryFn: async (): Promise<readonly IWalletItem[]> => {
      return loadWallets(apiClient);
    },
    enabled: isReady,
  });

  if (walletsQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (walletsQuery.isError || walletsQuery.data === undefined) {
    return <p>Не удалось загрузить кошельки.</p>;
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h1>Кошельки</h1>
      <div style={{ display: 'grid', gap: 8 }}>
        {walletsQuery.data.map((wallet) => (
          <WalletCard key={wallet.id} wallet={wallet} />
        ))}
      </div>
      <Link to="/wallets/add">+ Добавить кошелёк</Link>
    </section>
  );
};
