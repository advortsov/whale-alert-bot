import type { Context } from 'telegraf';
import { describe, expect, it, vi } from 'vitest';

import { WalletCallbackAction, type WalletCallbackTarget } from './telegram.interfaces';
import { TelegramUpdate } from './telegram.update';
import type { AppConfigService } from '../config/app-config.service';
import { HistoryRequestSource } from '../modules/whales/entities/history-rate-limiter.interfaces';
import {
  HistoryDirectionFilter,
  HistoryKind,
} from '../modules/whales/entities/history-request.dto';
import { AlertFilterToggleTarget } from '../modules/whales/entities/tracking.interfaces';
import type { TrackingService } from '../modules/whales/services/tracking.service';
import type { RuntimeStatusService } from '../runtime/runtime-status.service';

type ParsedMessageCommandView = {
  readonly command: string;
  readonly args: readonly string[];
  readonly lineNumber: number;
};

type TelegramUpdatePrivateApi = {
  parseMessageCommands: (rawText: string) => readonly ParsedMessageCommandView[];
  parseWalletCallbackData: (callbackData: string) => WalletCallbackTarget | null;
};

const createUpdate = (trackingServiceStub: TrackingService): TelegramUpdate => {
  const runtimeStatusServiceStub: RuntimeStatusService = {
    getSnapshot: () => ({
      observedBlock: 100,
      processedBlock: 99,
      lag: 1,
      queueSize: 0,
      backoffMs: 0,
      confirmations: 2,
      updatedAtIso: '2026-02-09T00:00:00.000Z',
    }),
    setSnapshot: (): void => undefined,
  } as unknown as RuntimeStatusService;
  const appConfigServiceStub: AppConfigService = {
    appVersion: '0.1.0-test',
  } as unknown as AppConfigService;

  return TelegramUpdate.createForTesting(
    trackingServiceStub,
    runtimeStatusServiceStub,
    appConfigServiceStub,
  );
};

describe('TelegramUpdate', (): void => {
  it('parses multiple /track commands from one multiline message as separate commands', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] = privateApi.parseMessageCommands(
      [
        '/track eth 0x28C6c06298d514Db089934071355E5743bf21d60',
        'Binance_Cold_Wallet_1',
        '/track eth 0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
        'Binance_Cold_Wallet_2',
      ].join('\n'),
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      command: 'track',
      args: ['eth', '0x28C6c06298d514Db089934071355E5743bf21d60', 'Binance_Cold_Wallet_1'],
      lineNumber: 1,
    });
    expect(parsed[1]).toMatchObject({
      command: 'track',
      args: ['eth', '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', 'Binance_Cold_Wallet_2'],
      lineNumber: 3,
    });
  });

  it('parses explicit chain in /track command', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] = privateApi.parseMessageCommands(
      '/track sol 11111111111111111111111111111111 system',
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'track',
      args: ['sol', '11111111111111111111111111111111', 'system'],
      lineNumber: 1,
    });
  });

  it('parses multiline /track sol command with address and label on next lines', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] = privateApi.parseMessageCommands(
      ['/track sol', 'GK3mWh4hdBokYhQ1tY4eVThdSvJvEkwL9wfadTmX6w5h', 'sol1'].join('\n'),
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'track',
      args: ['sol', 'GK3mWh4hdBokYhQ1tY4eVThdSvJvEkwL9wfadTmX6w5h', 'sol1'],
      lineNumber: 1,
    });
  });

  it('parses tron alias in /track command', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] = privateApi.parseMessageCommands(
      '/track tron TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 treasury',
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'track',
      args: ['tron', 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7', 'treasury'],
      lineNumber: 1,
    });
  });

  it('parses new smart filter commands', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] = privateApi.parseMessageCommands(
      [
        '/threshold 50000',
        '/filter min_amount_usd 100000',
        '/filter cex out',
        '/filter type buy',
        '/filter include_dex uniswap,curve',
        '/filter exclude_dex off',
        '/quiet 23:00-07:00',
        '/tz Europe/Moscow',
      ].join('\n'),
    );

    expect(parsed).toHaveLength(8);
    expect(parsed[0]).toMatchObject({ command: 'threshold', args: ['50000'] });
    expect(parsed[1]).toMatchObject({ command: 'filter', args: ['min_amount_usd', '100000'] });
    expect(parsed[2]).toMatchObject({ command: 'filter', args: ['cex', 'out'] });
    expect(parsed[3]).toMatchObject({ command: 'filter', args: ['type', 'buy'] });
    expect(parsed[4]).toMatchObject({ command: 'filter', args: ['include_dex', 'uniswap,curve'] });
    expect(parsed[5]).toMatchObject({ command: 'filter', args: ['exclude_dex', 'off'] });
    expect(parsed[6]).toMatchObject({ command: 'quiet', args: ['23:00-07:00'] });
    expect(parsed[7]).toMatchObject({ command: 'tz', args: ['Europe/Moscow'] });
  });

  it('parses alert ignore callback payload', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const callbackTarget = privateApi.parseWalletCallbackData('alert_ignore_24h:16');

    expect(callbackTarget).toMatchObject({
      action: WalletCallbackAction.IGNORE_24H,
      walletId: 16,
      muteMinutes: 1440,
    });
  });

  it('uses policy-aware history method for callback and returns cooldown error text', async (): Promise<void> => {
    const getAddressHistoryPageWithPolicyMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockRejectedValue(new Error('Слишком часто нажимаешь кнопку истории. Повтори через 2 сек.'));
    const trackingServiceStub = {
      getAddressHistoryPageWithPolicy: getAddressHistoryPageWithPolicyMock,
    } as unknown as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const answerCbQueryMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const replyMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ message_id: 777, text: 'ok' });
    const callbackContext = {
      callbackQuery: {
        data: 'wallet_history:16',
      },
      from: {
        id: 42,
        username: 'tester',
      },
      update: {
        update_id: 100,
      },
      answerCbQuery: answerCbQueryMock,
      reply: replyMock,
    };

    await update.onCallbackQuery(callbackContext as unknown as Context);

    expect(getAddressHistoryPageWithPolicyMock).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      {
        rawAddress: '#16',
        rawLimit: '10',
        rawOffset: '0',
        source: HistoryRequestSource.CALLBACK,
        rawKind: HistoryKind.ALL,
        rawDirection: HistoryDirectionFilter.ALL,
      },
    );
    expect(answerCbQueryMock).toHaveBeenCalledWith('Выполняю действие...');
    expect(replyMock).toHaveBeenCalledWith(
      'Ошибка обработки команд: Слишком часто нажимаешь кнопку истории. Повтори через 2 сек.',
      expect.anything(),
    );
  });

  it('handles wallet menu callback and loads wallet details by id', async (): Promise<void> => {
    const getWalletDetailsMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue('Кошелек #16\nAddress: 0x96b0...');
    const trackingServiceStub = {
      getWalletDetails: getWalletDetailsMock,
    } as unknown as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const answerCbQueryMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const replyMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ message_id: 1000, text: 'ok' });
    const callbackContext = {
      callbackQuery: {
        data: 'wallet_menu:16',
      },
      from: {
        id: 42,
        username: 'tester',
      },
      update: {
        update_id: 200,
      },
      answerCbQuery: answerCbQueryMock,
      reply: replyMock,
    };

    await update.onCallbackQuery(callbackContext as unknown as Context);

    expect(getWalletDetailsMock).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      '#16',
    );
    expect(answerCbQueryMock).toHaveBeenCalledWith('Выполняю действие...');
    expect(replyMock).toHaveBeenCalledWith('Кошелек #16\nAddress: 0x96b0...', expect.anything());
  });

  it('handles wallet filters callback and returns inline toggle keyboard', async (): Promise<void> => {
    const getWalletAlertFilterStateMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
      walletId: 16,
      chainKey: 'ethereum_mainnet',
      walletAddress: '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
      walletLabel: 'my',
      allowTransfer: true,
      allowSwap: false,
      hasWalletOverride: true,
    });
    const trackingServiceStub = {
      getWalletAlertFilterState: getWalletAlertFilterStateMock,
    } as unknown as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const answerCbQueryMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const replyMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ message_id: 1500, text: 'ok' });
    const callbackContext = {
      callbackQuery: {
        data: 'wallet_filters:16',
      },
      from: {
        id: 42,
        username: 'tester',
      },
      update: {
        update_id: 500,
      },
      answerCbQuery: answerCbQueryMock,
      reply: replyMock,
    };

    await update.onCallbackQuery(callbackContext as unknown as Context);

    expect(getWalletAlertFilterStateMock).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      '#16',
    );
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Фильтры кошелька #16'),
      expect.anything(),
    );
  });

  it('handles wallet filter toggle callback and applies wallet override', async (): Promise<void> => {
    const setWalletEventTypeFilterMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({
      walletId: 16,
      chainKey: 'ethereum_mainnet',
      walletAddress: '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
      walletLabel: 'my',
      allowTransfer: false,
      allowSwap: false,
      hasWalletOverride: true,
    });
    const trackingServiceStub = {
      setWalletEventTypeFilter: setWalletEventTypeFilterMock,
    } as unknown as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const answerCbQueryMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const replyMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ message_id: 1600, text: 'ok' });
    const callbackContext = {
      callbackQuery: {
        data: 'wallet_filter_toggle:16:transfer:off',
      },
      from: {
        id: 42,
        username: 'tester',
      },
      update: {
        update_id: 600,
      },
      answerCbQuery: answerCbQueryMock,
      reply: replyMock,
    };

    await update.onCallbackQuery(callbackContext as unknown as Context);

    expect(setWalletEventTypeFilterMock).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      '#16',
      AlertFilterToggleTarget.TRANSFER,
      false,
    );
    expect(replyMock).toHaveBeenCalledWith(
      expect.stringContaining('Фильтры кошелька #16'),
      expect.anything(),
    );
  });

  it('handles ignore-24h callback and mutes wallet', async (): Promise<void> => {
    const muteWalletAlertsForDurationMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue('Кошелек #16 временно отключен');
    const trackingServiceStub = {
      muteWalletAlertsForDuration: muteWalletAlertsForDurationMock,
    } as unknown as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const answerCbQueryMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const replyMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ message_id: 1700, text: 'ok' });
    const callbackContext = {
      callbackQuery: {
        data: 'alert_ignore_24h:16',
      },
      from: {
        id: 42,
        username: 'tester',
      },
      update: {
        update_id: 700,
      },
      answerCbQuery: answerCbQueryMock,
      reply: replyMock,
    };

    await update.onCallbackQuery(callbackContext as unknown as Context);

    expect(muteWalletAlertsForDurationMock).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      '#16',
      1440,
      'alert_button',
    );
    expect(replyMock).toHaveBeenCalledWith('Кошелек #16 временно отключен', expect.anything());
  });
});
