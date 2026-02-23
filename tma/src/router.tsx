import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { TmaRuntimeSync } from './components/TmaRuntimeSync';
import { LoadingSpinner } from './components/LoadingSpinner';

interface ILazyRouteModule {
  readonly default: React.ComponentType;
}

const DashboardPage = React.lazy(async (): Promise<ILazyRouteModule> => {
  const module = await import('./pages/DashboardPage');
  return { default: module.DashboardPage };
});

const WalletsPage = React.lazy(async (): Promise<ILazyRouteModule> => {
  const module = await import('./pages/WalletsPage');
  return { default: module.WalletsPage };
});

const AddWalletPage = React.lazy(async (): Promise<ILazyRouteModule> => {
  const module = await import('./pages/AddWalletPage');
  return { default: module.AddWalletPage };
});

const WalletDetailPage = React.lazy(async (): Promise<ILazyRouteModule> => {
  const module = await import('./pages/WalletDetailPage');
  return { default: module.WalletDetailPage };
});

const SettingsPage = React.lazy(async (): Promise<ILazyRouteModule> => {
  const module = await import('./pages/SettingsPage');
  return { default: module.SettingsPage };
});

const withSuspense = (element: React.JSX.Element): React.JSX.Element => {
  return <React.Suspense fallback={<LoadingSpinner />}>{element}</React.Suspense>;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <TmaRuntimeSync />,
    children: [
      {
        index: true,
        element: withSuspense(<DashboardPage />),
      },
      {
        path: 'wallets',
        element: withSuspense(<WalletsPage />),
      },
      {
        path: 'wallets/add',
        element: withSuspense(<AddWalletPage />),
      },
      {
        path: 'wallets/:id',
        element: withSuspense(<WalletDetailPage />),
      },
      {
        path: 'settings',
        element: withSuspense(<SettingsPage />),
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
