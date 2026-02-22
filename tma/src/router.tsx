import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { TmaRuntimeSync } from './components/TmaRuntimeSync';
import { AddWalletPage } from './pages/AddWalletPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { WalletDetailPage } from './pages/WalletDetailPage';
import { WalletsPage } from './pages/WalletsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <TmaRuntimeSync />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'wallets',
        element: <WalletsPage />,
      },
      {
        path: 'wallets/add',
        element: <AddWalletPage />,
      },
      {
        path: 'wallets/:id',
        element: <WalletDetailPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: '*',
        element: <Navigate to="/" replace />,
      },
    ],
  },
]);
