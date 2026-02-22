import React from 'react';
import { Button, Placeholder, Section, Title } from '@telegram-apps/telegram-ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { loadWallets } from '../api/wallets';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { WalletCard } from '../components/WalletCard';
import { useAuth } from '../hooks/useAuth';
import type { IWalletSummaryDto } from '../types/api.types';

export const WalletsPage = (): React.JSX.Element => {
  const { apiClient, isReady } = useAuth();
  const walletsQuery: UseQueryResult<readonly IWalletSummaryDto[]> = useQuery<
    readonly IWalletSummaryDto[]
  >({
    queryKey: ['wallets'],
    queryFn: async (): Promise<readonly IWalletSummaryDto[]> => {
      return loadWallets(apiClient);
    },
    enabled: isReady,
  });

  if (walletsQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (walletsQuery.isError || walletsQuery.data === undefined) {
    return (
      <section className="tma-screen tma-screen-centered">
        <Placeholder header="Не удалось загрузить кошельки" description="Проверь сеть и попробуй снова." />
      </section>
    );
  }

  return (
    <section className="tma-screen">
      <Section>
        <Title level="2" weight="2">
          Кошельки
        </Title>
      </Section>
      <Section>
        <div className="tma-grid">
          {walletsQuery.data.length === 0 ? (
            <Placeholder header="Нет кошельков" description="Добавь новый адрес для отслеживания." />
          ) : null}
        {walletsQuery.data.map((wallet) => (
          <WalletCard key={wallet.walletId} wallet={wallet} />
        ))}
        </div>
      </Section>
      <Section>
        <Link to="/wallets/add" className="tma-link-reset">
          <Button mode="filled" size="m" stretched>
            + Добавить кошелёк
          </Button>
        </Link>
      </Section>
    </section>
  );
};
