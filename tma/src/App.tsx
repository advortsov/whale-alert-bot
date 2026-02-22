import React from 'react';
import { RouterProvider } from 'react-router-dom';

import { AuthErrorPanel } from './components/AuthErrorPanel';
import { LoadingSpinner } from './components/LoadingSpinner';
import { useAuth } from './hooks/useAuth';
import { router } from './router';

export const App = (): React.JSX.Element => {
  const { isReady, authError } = useAuth();

  if (!isReady) {
    return <LoadingSpinner />;
  }

  if (authError !== null) {
    return <AuthErrorPanel message={authError} />;
  }

  return <RouterProvider router={router} />;
};
