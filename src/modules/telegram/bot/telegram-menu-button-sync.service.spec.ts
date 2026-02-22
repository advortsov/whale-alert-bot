import type { Telegraf } from 'telegraf';
import { describe, expect, it, vi } from 'vitest';

import { TelegramMenuButtonSyncService } from './telegram-menu-button-sync.service';
import type { AppConfigService } from '../../../config/app-config.service';

interface IAppConfigServiceStub {
  readonly telegramEnabled: boolean;
  readonly tmaBaseUrl: string | null;
}

interface ITelegramStub {
  readonly telegram: {
    setChatMenuButton: ReturnType<typeof vi.fn>;
  };
}

const createService = (params: {
  telegramEnabled: boolean;
  tmaRootUrl: string | null;
  setChatMenuButtonMock?: ReturnType<typeof vi.fn>;
}): TelegramMenuButtonSyncService => {
  const setChatMenuButtonMock: ReturnType<typeof vi.fn> =
    params.setChatMenuButtonMock ?? vi.fn().mockResolvedValue(true);
  const botStub: ITelegramStub = {
    telegram: {
      setChatMenuButton: setChatMenuButtonMock,
    },
  };
  const appConfigServiceStub: IAppConfigServiceStub = {
    telegramEnabled: params.telegramEnabled,
    tmaBaseUrl: params.tmaRootUrl,
  };

  return new TelegramMenuButtonSyncService(
    botStub as unknown as Telegraf,
    appConfigServiceStub as unknown as AppConfigService,
  );
};

describe('TelegramMenuButtonSyncService', (): void => {
  it('syncs default telegram menu button with TMA root url', async (): Promise<void> => {
    const setChatMenuButtonMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(true);
    const service: TelegramMenuButtonSyncService = createService({
      telegramEnabled: true,
      tmaRootUrl: 'https://1303118-cr22992.tw1.ru/tma/',
      setChatMenuButtonMock,
    });

    await service.onModuleInit();

    expect(setChatMenuButtonMock).toHaveBeenCalledTimes(1);
    expect(setChatMenuButtonMock).toHaveBeenCalledWith({
      menuButton: {
        type: 'web_app',
        text: '🚀 Mini App',
        web_app: {
          url: 'https://1303118-cr22992.tw1.ru/tma/',
        },
      },
    });
  });

  it('skips sync when tma url is not configured', async (): Promise<void> => {
    const setChatMenuButtonMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(true);
    const service: TelegramMenuButtonSyncService = createService({
      telegramEnabled: true,
      tmaRootUrl: null,
      setChatMenuButtonMock,
    });

    await service.onModuleInit();

    expect(setChatMenuButtonMock).not.toHaveBeenCalled();
  });
});
