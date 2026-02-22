import React from 'react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { RouterProvider } from 'react-router-dom';

import { AuthErrorPanel } from './components/AuthErrorPanel';
import { LoadingSpinner } from './components/LoadingSpinner';
import { useAuth } from './hooks/useAuth';
import { router } from './router';

export const App = (): React.JSX.Element => {
  const { isReady, authError } = useAuth();

  let content: React.JSX.Element = <RouterProvider router={router} />;

  if (!isReady) {
    content = <LoadingSpinner />;
  } else if (authError !== null) {
    content = <AuthErrorPanel message={authError} />;
  }

  return (
    <AppRoot appearance="dark" className="tma-app-root">
      {content}
    </AppRoot>
  );
};
