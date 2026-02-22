import React from 'react';
import { Button, Card, Placeholder, Section, Text, Title } from '@telegram-apps/telegram-ui';
import { Link } from 'react-router-dom';

import { WalletCard } from '../components/WalletCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useTmaInit } from '../hooks/useTmaInit';

export const DashboardPage = (): React.JSX.Element => {
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
          <Link to="/wallets" className="tma-link-reset">
            <Button mode="filled" size="m" stretched>
              Все кошельки
            </Button>
          </Link>
          <Link to="/wallets/add" className="tma-link-reset">
            <Button mode="bezeled" size="m" stretched>
              Добавить
            </Button>
          </Link>
          <Link to="/settings" className="tma-link-reset">
            <Button mode="gray" size="m" stretched>
              Настройки
            </Button>
          </Link>
        </div>
      </Section>
    </section>
  );
};
