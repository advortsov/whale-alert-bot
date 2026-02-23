interface ITelegramBackButton {
  readonly isVisible?: boolean;
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

export interface ITelegramWebApp {
  readonly initData: string;
  readonly initDataUnsafe?: {
    readonly start_param?: string;
  };
  readonly themeParams?: Readonly<Record<string, string>>;
  readonly colorScheme?: 'light' | 'dark';
  readonly BackButton?: ITelegramBackButton;
  ready(): void;
  expand(): void;
  close(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
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

export const openExternalLink = (url: string): void => {
  const normalizedUrl: string = url.trim();

  if (normalizedUrl.length === 0) {
    return;
  }

  const webApp: ITelegramWebApp | null = getTelegramWebApp();

  if (webApp !== null) {
    webApp.openLink(normalizedUrl, { try_instant_view: false });
    return;
  }

  window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
};

const readParamFromLocation = (paramName: string): string | null => {
  const valueFromSearch: string | null = readRawParam(window.location.search, paramName);

  if (valueFromSearch !== null && valueFromSearch.trim().length > 0) {
    return valueFromSearch;
  }

  const valueFromHash: string | null = readRawParam(window.location.hash, paramName);

  if (valueFromHash !== null && valueFromHash.trim().length > 0) {
    return valueFromHash;
  }

  return null;
};

const readRawParam = (source: string, paramName: string): string | null => {
  const normalizedSource: string =
    source.startsWith('?') || source.startsWith('#') ? source.slice(1) : source;

  if (normalizedSource.length === 0) {
    return null;
  }

  const parts: string[] = normalizedSource.split('&');
  const keyPrefix: string = `${paramName}=`;

  for (const part of parts) {
    if (!part.startsWith(keyPrefix)) {
      continue;
    }

    const rawValue: string = part.slice(keyPrefix.length);
    if (rawValue.length === 0) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
};
