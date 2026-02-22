import React from 'react';
import { Link } from 'react-router-dom';

import { WalletCard } from '../components/WalletCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useTmaInit } from '../hooks/useTmaInit';

export const DashboardPage = (): React.JSX.Element => {
  const initQuery = useTmaInit();

  if (initQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (initQuery.isError || initQuery.data === undefined) {
    return <p>Не удалось загрузить dashboard.</p>;
  }

  const wallets = initQuery.data.wallets.wallets;

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <h1>Whale Alert</h1>
      <p>Алертов сегодня: {initQuery.data.todayAlertCount}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {wallets.slice(0, 5).map((wallet) => (
          <WalletCard key={wallet.id} wallet={wallet} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link to="/wallets">Все кошельки</Link>
        <Link to="/wallets/add">Добавить</Link>
        <Link to="/settings">Настройки</Link>
      </div>
    </section>
  );
};
