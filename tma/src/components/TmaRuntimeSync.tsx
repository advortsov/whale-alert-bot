import React, { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { themeParamsState, useLaunchParams, useSignal } from '@telegram-apps/sdk-react';

import { parseDeepLink } from '../utils/deep-link';
import { getStartParam } from '../utils/telegram-webapp';

export const TmaRuntimeSync = (): React.JSX.Element => {
  const navigate = useNavigate();
  const themeParams = useSignal(themeParamsState);
  const launchParams = useLaunchParams();

  useEffect((): void => {
    const root: HTMLElement = document.documentElement;
    Object.entries(themeParams).forEach(([key, value]): void => {
      if (typeof value === 'string') {
        root.style.setProperty(`--tg-theme-${key}`, value);
      }
    });
  }, [themeParams]);

  useEffect((): void => {
    const startParamFromSdk: string | null =
      typeof launchParams.startParam === 'string' ? launchParams.startParam : null;
    const startParam: string | null = startParamFromSdk ?? getStartParam();
    const parsedDeepLink = parseDeepLink(startParam);

    if (parsedDeepLink !== null && parsedDeepLink.type === 'wallet') {
      void navigate(`/wallets/${parsedDeepLink.id}`, { replace: true });
    }
  }, [launchParams.startParam, navigate]);

  return <Outlet />;
};
