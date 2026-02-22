export interface ITelegramWebApp {
  readonly initData: string;
  readonly initDataUnsafe?: {
    readonly start_param?: string;
  };
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
  if (webApp === null) {
    return '';
  }

  return webApp.initData ?? '';
};

export const getStartParam = (): string | null => {
  const webApp: ITelegramWebApp | null = getTelegramWebApp();
  const startParam: string | undefined = webApp?.initDataUnsafe?.start_param;

  if (typeof startParam !== 'string' || startParam.length === 0) {
    return null;
  }

  return startParam;
};
