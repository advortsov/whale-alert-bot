import React from 'react';
import { Button, Card, List, Placeholder, Section, Text, Title } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router-dom';

import { WalletCard } from '../components/WalletCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useTmaInit } from '../hooks/useTmaInit';

export const DashboardPage = (): React.JSX.Element => {
  const navigate = useNavigate();
  const initQuery = useTmaInit();
  const errorMessage: string | null =
    initQuery.error instanceof Error ? initQuery.error.message : null;

  if (initQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (initQuery.isError || initQuery.data === undefined) {
    return (
      <section className="tma-screen tma-screen-centered">
        <Placeholder
          header="Не удалось загрузить dashboard"
          description={errorMessage ?? 'Ошибка сети или недоступен endpoint /api/tma/init.'}
        >
          <Button
            mode="filled"
            size="m"
            stretched
            onClick={(): void => {
              void initQuery.refetch();
            }}
          >
            Повторить
          </Button>
        </Placeholder>
      </section>
    );
  }

  const wallets = initQuery.data.wallets.wallets;

  return (
    <section className="tma-screen">
      <List>
        <Section>
          <Title level="1" weight="2">
            Whale Alert
          </Title>
          <Card className="tma-card">
            <Text>Алертов сегодня: {initQuery.data.todayAlertCount}</Text>
          </Card>
        </Section>

        <Section header="Кошельки">
          <div className="tma-grid">
            {wallets.length === 0 ? (
              <Placeholder header="Список пуст" description="Добавь первый кошелёк для отслеживания." />
            ) : null}
            {wallets.slice(0, 5).map((wallet) => (
              <WalletCard key={wallet.walletId} wallet={wallet} />
            ))}
          </div>
        </Section>

        <Section>
          <div className="tma-actions">
            <Button
              mode="filled"
              size="m"
              stretched
              onClick={(): void => {
                void navigate('/wallets');
              }}
            >
              Все кошельки
            </Button>
            <Button
              mode="bezeled"
              size="m"
              stretched
              onClick={(): void => {
                void navigate('/wallets/add');
              }}
            >
              Добавить
            </Button>
            <Button
              mode="gray"
              size="m"
              stretched
              onClick={(): void => {
                void navigate('/settings');
              }}
            >
              Настройки
            </Button>
          </div>
        </Section>
      </List>
    </section>
  );
};
