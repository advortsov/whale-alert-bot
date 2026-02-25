import { describe, expect, it, vi } from 'vitest';

import {
  TelegramCallbackCommandsService,
  TelegramCallbackCommandsServiceDependencies,
} from './telegram-callback-commands.service';
import { GlobalDexFilterMode } from './telegram-global-filters-callback.interfaces';
import { WalletCallbackAction } from './telegram.interfaces';

describe('TelegramCallbackCommandsService', (): void => {
  it('moves dex between include/exclude lists on global toggle', async (): Promise<void> => {
    const deps: TelegramCallbackCommandsServiceDependencies =
      new TelegramCallbackCommandsServiceDependencies();
    const setIncludeDexFilterMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const setExcludeDexFilterMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const getSettingsMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValueOnce({
        settings: {
          includeDexes: ['uniswap'],
          excludeDexes: [],
        },
      })
      .mockResolvedValueOnce({
        settings: {
          includeDexes: [],
          excludeDexes: ['uniswap'],
        },
      });

    (
      deps as unknown as {
        trackingService: {
          getSettings: ReturnType<typeof vi.fn>;
          setIncludeDexFilter: ReturnType<typeof vi.fn>;
          setExcludeDexFilter: ReturnType<typeof vi.fn>;
        };
      }
    ).trackingService = {
      getSettings: getSettingsMock,
      setIncludeDexFilter: setIncludeDexFilterMock,
      setExcludeDexFilter: setExcludeDexFilterMock,
    };
    (
      deps as unknown as {
        globalFiltersUiService: {
          formatGlobalDexFiltersMessage: ReturnType<typeof vi.fn>;
          buildGlobalDexFiltersInlineKeyboard: ReturnType<typeof vi.fn>;
        };
      }
    ).globalFiltersUiService = {
      formatGlobalDexFiltersMessage: vi.fn().mockReturnValue('ok'),
      buildGlobalDexFiltersInlineKeyboard: vi.fn().mockReturnValue(null),
    };
    (deps as unknown as { uiService: Record<string, unknown> }).uiService = {};

    const service: TelegramCallbackCommandsService = new TelegramCallbackCommandsService(deps);

    const result = await service.executeWalletCallbackAction(
      {
        telegramId: '42',
        username: 'tester',
      },
      {
        action: WalletCallbackAction.GLOBAL_FILTERS_DEX_TOGGLE,
        walletId: null,
        muteMinutes: null,
        historyOffset: null,
        historyLimit: null,
        historyKind: null,
        historyDirection: null,
        filterTarget: null,
        filterEnabled: null,
        globalFilters: {
          mode: GlobalDexFilterMode.EXCLUDE,
          dexKey: 'uniswap',
          enabled: true,
          isReset: false,
        },
      },
    );

    expect(setIncludeDexFilterMock).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      'off',
    );
    expect(setExcludeDexFilterMock).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      'uniswap',
    );
    expect(result.message).toBe('ok');
  });
});
