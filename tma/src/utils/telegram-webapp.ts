export interface ITelegramWebApp {
  readonly initData: string;
  readonly initDataUnsafe?: {
    readonly start_param?: string;
  };
  readonly themeParams?: Readonly<Record<string, string>>;
  readonly colorScheme?: 'light' | 'dark';
  ready(): void;
  expand(): void;
  close(): void;
}

interface ITelegramWindow {
  readonly Telegram?: {
    readonly WebApp?: ITelegramWebApp;
  };
}

export const getTelegramWebApp = (): ITelegramWebApp | null => {
  const typedWindow: ITelegramWindow = window as unknown as ITelegramWindow;
  return typedWindow.Telegram?.WebApp ?? null;
};

export const getInitDataRaw = (): string => {
  const webApp: ITelegramWebApp | null = getTelegramWebApp();
  const initDataFromWebApp: string = webApp?.initData ?? '';

  if (initDataFromWebApp.trim().length > 0) {
    return initDataFromWebApp;
  }

  const queryFallback: string | null = readParamFromLocation('tgWebAppData');
  return queryFallback ?? '';
};

export const getStartParam = (): string | null => {
  const webApp: ITelegramWebApp | null = getTelegramWebApp();
  const startParam: string | undefined = webApp?.initDataUnsafe?.start_param;

  if (typeof startParam !== 'string' || startParam.length === 0) {
    return readParamFromLocation('startapp');
  }

  return startParam;
};

const readParamFromLocation = (paramName: string): string | null => {
  const searchParams: URLSearchParams = new URLSearchParams(window.location.search);
  const valueFromSearch: string | null = searchParams.get(paramName);

  if (valueFromSearch !== null && valueFromSearch.trim().length > 0) {
    return valueFromSearch;
  }

  const hashRaw: string = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams: URLSearchParams = new URLSearchParams(hashRaw);
  const valueFromHash: string | null = hashParams.get(paramName);

  if (valueFromHash !== null && valueFromHash.trim().length > 0) {
    return valueFromHash;
  }

  return null;
};
