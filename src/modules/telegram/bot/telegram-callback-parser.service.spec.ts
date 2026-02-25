import { describe, expect, it } from 'vitest';

import { TelegramCallbackParserService } from './telegram-callback-parser.service';
import { TelegramGlobalFiltersCallbackParserService } from './telegram-global-filters-callback-parser.service';
import { GlobalDexFilterMode } from './telegram-global-filters-callback.interfaces';
import { WalletCallbackAction } from './telegram.interfaces';

describe('TelegramCallbackParserService', (): void => {
  const createService = (): TelegramCallbackParserService => {
    const globalFiltersParser: TelegramGlobalFiltersCallbackParserService =
      new TelegramGlobalFiltersCallbackParserService();

    return new TelegramCallbackParserService(globalFiltersParser);
  };

  it('parses global filters refresh callback', (): void => {
    const service: TelegramCallbackParserService = createService();

    const parsed = service.parseWalletCallbackData('gf:refresh');

    expect(parsed).toEqual({
      action: WalletCallbackAction.GLOBAL_FILTERS,
      walletId: null,
      muteMinutes: null,
      historyOffset: null,
      historyLimit: null,
      historyKind: null,
      historyDirection: null,
      filterTarget: null,
      filterEnabled: null,
      globalFilters: {
        mode: GlobalDexFilterMode.INCLUDE,
        dexKey: null,
        enabled: null,
        isReset: false,
      },
    });
  });

  it('parses global filters toggle callback', (): void => {
    const service: TelegramCallbackParserService = createService();

    const parsed = service.parseWalletCallbackData('gf:toggle:exclude:curve:on');

    expect(parsed).toEqual({
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
        dexKey: 'curve',
        enabled: true,
        isReset: false,
      },
    });
  });

  it('returns null for malformed global filters callback payload', (): void => {
    const service: TelegramCallbackParserService = createService();

    const parsed = service.parseWalletCallbackData('gf:toggle:include');

    expect(parsed).toBeNull();
  });
});
