import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { loginWithInitData } from '../api/auth';
import { ApiClient, type IApiClientContext } from '../api/client';
import type { ITokens } from '../types/api.types';
import { getInitDataRaw, getTelegramWebApp } from '../utils/telegram-webapp';

const ACCESS_TOKEN_KEY: string = 'tma_access_token';
const REFRESH_TOKEN_KEY: string = 'tma_refresh_token';

export interface IAuthContextValue {
  readonly isReady: boolean;
  readonly apiClient: ApiClient;
  readonly login: () => Promise<void>;
}

const createDefaultContextValue = (): IAuthContextValue => {
  const fallbackContext: IApiClientContext = {
    getAccessToken: (): string | null => null,
    relogin: async (): Promise<ITokens> => {
      throw new Error('AuthProvider is not initialized');
    },
  };

  return {
    isReady: false,
    apiClient: new ApiClient(fallbackContext),
    login: async (): Promise<void> => {
      return Promise.resolve();
    },
  };
};

export const AuthContext = createContext<IAuthContextValue>(createDefaultContextValue());

interface IAuthProviderProps {
  readonly children: React.ReactNode;
}

const readStoredToken = (key: string): string | null => {
  const value: string | null = sessionStorage.getItem(key);
  if (value === null || value.trim().length === 0) {
    return null;
  }

  return value;
};

export const AuthProvider = ({ children }: IAuthProviderProps): React.JSX.Element => {
  const [accessToken, setAccessToken] = useState<string | null>(readStoredToken(ACCESS_TOKEN_KEY));
  const [isReady, setIsReady] = useState<boolean>(false);

  const applyTokens = useCallback((tokens: ITokens): void => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    setAccessToken(tokens.accessToken);
  }, []);

  const login = useCallback(async (): Promise<void> => {
    const initDataRaw: string = getInitDataRaw();
    if (initDataRaw.length === 0) {
      throw new Error('Telegram initData is empty. Open app via Telegram.');
    }

    const tokens: ITokens = await loginWithInitData(initDataRaw);
    applyTokens(tokens);
  }, [applyTokens]);

  useEffect((): void => {
    const webApp = getTelegramWebApp();
    if (webApp !== null) {
      webApp.ready();
      webApp.expand();
    }

    const bootstrap = async (): Promise<void> => {
      try {
        if (accessToken === null) {
          await login();
        }
      } finally {
        setIsReady(true);
      }
    };

    void bootstrap();
  }, [accessToken, login]);

  const apiClient = useMemo((): ApiClient => {
    const context: IApiClientContext = {
      getAccessToken: (): string | null => {
        return readStoredToken(ACCESS_TOKEN_KEY);
      },
      relogin: async (): Promise<ITokens> => {
        const initDataRaw: string = getInitDataRaw();
        const tokens: ITokens = await loginWithInitData(initDataRaw);
        applyTokens(tokens);
        return tokens;
      },
    };

    return new ApiClient(context);
  }, [applyTokens]);

  const contextValue: IAuthContextValue = {
    isReady,
    apiClient,
    login,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};
