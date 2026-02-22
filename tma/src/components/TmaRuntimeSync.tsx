import React, { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { parseDeepLink } from '../utils/deep-link';
import { getStartParam, getTelegramWebApp } from '../utils/telegram-webapp';

export const TmaRuntimeSync = (): React.JSX.Element => {
  const navigate = useNavigate();

  useEffect((): void => {
    const webApp = getTelegramWebApp();
    const themeParams: Readonly<Record<string, string>> = webApp?.themeParams ?? {};
    const root: HTMLElement = document.documentElement;
    Object.entries(themeParams).forEach(([key, value]): void => {
      if (typeof value === 'string') {
        root.style.setProperty(`--tg-theme-${key}`, value);
      }
    });
  }, []);

  useEffect((): void => {
    const startParam: string | null = getStartParam();
    const parsedDeepLink = parseDeepLink(startParam);

    if (parsedDeepLink !== null && parsedDeepLink.type === 'wallet') {
      void navigate(`/wallets/${parsedDeepLink.id}`, { replace: true });
    }
  }, [navigate]);

  return <Outlet />;
};
