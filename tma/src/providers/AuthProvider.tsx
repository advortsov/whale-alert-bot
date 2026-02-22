import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { loginWithInitData } from '../api/auth';
import { ApiClient, type IApiClientContext } from '../api/client';
import type { ITokens } from '../types/api.types';
import { getInitDataRaw, getTelegramWebApp } from '../utils/telegram-webapp';

const ACCESS_TOKEN_KEY: string = 'tma_access_token';
const REFRESH_TOKEN_KEY: string = 'tma_refresh_token';

export interface IAuthContextValue {
  readonly isReady: boolean;
  readonly authError: string | null;
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
    authError: null,
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
  const [authError, setAuthError] = useState<string | null>(null);

  const clearTokens = useCallback((): void => {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    setAccessToken(null);
  }, []);

  const applyTokens = useCallback((tokens: ITokens): void => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    setAccessToken(tokens.accessToken);
    setAuthError(null);
  }, []);

  const login = useCallback(async (): Promise<void> => {
    const initDataRaw: string = getInitDataRaw();
    if (initDataRaw.length === 0) {
      throw new Error(
        'Не получил Telegram initData. Открой Mini App через кнопку /app в Telegram.',
      );
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
        const runtimeInitDataRaw: string = getInitDataRaw();
        const hasRuntimeInitData: boolean = runtimeInitDataRaw.trim().length > 0;

        // Если Telegram дал initData, всегда получаем свежую JWT-пару.
        if (hasRuntimeInitData) {
          await login();
        } else if (accessToken === null) {
          throw new Error(
            'Не получил Telegram initData. Открой Mini App через кнопку /app в Telegram.',
          );
        }
      } catch (error: unknown) {
        const message: string = error instanceof Error ? error.message : 'Ошибка авторизации TMA.';
        clearTokens();
        setAuthError(message);
      } finally {
        setIsReady(true);
      }
    };

    void bootstrap();
  }, [accessToken, clearTokens, login]);

  const apiClient = useMemo((): ApiClient => {
    const context: IApiClientContext = {
      getAccessToken: (): string | null => {
        return readStoredToken(ACCESS_TOKEN_KEY);
      },
      relogin: async (): Promise<ITokens> => {
        try {
          const initDataRaw: string = getInitDataRaw();

          if (initDataRaw.length === 0) {
            throw new Error(
              'Сессия истекла, но Telegram initData недоступен. Перезапусти Mini App из /app.',
            );
          }

          const tokens: ITokens = await loginWithInitData(initDataRaw);
          applyTokens(tokens);
          return tokens;
        } catch (error: unknown) {
          clearTokens();
          const message: string =
            error instanceof Error ? error.message : 'Не удалось обновить авторизацию.';
          setAuthError(message);
          throw error;
        }
      },
    };

    return new ApiClient(context);
  }, [applyTokens, clearTokens]);

  const contextValue: IAuthContextValue = {
    isReady,
    authError,
    apiClient,
    login,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};
