import type { Context } from 'telegraf';
import { describe, expect, it, vi } from 'vitest';

import {
  WalletCallbackAction,
  WalletCallbackTargetType,
  type WalletCallbackTarget,
} from './telegram.interfaces';
import { TelegramUpdate } from './telegram.update';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';
import type { RuntimeStatusService } from '../runtime/runtime-status.service';
import { HistoryRequestSource } from '../tracking/history-rate-limiter.interfaces';
import { AlertFilterToggleTarget } from '../tracking/tracking.interfaces';
import type { TrackingService } from '../tracking/tracking.service';

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

  return new TelegramUpdate(trackingServiceStub, runtimeStatusServiceStub);
};

describe('TelegramUpdate', (): void => {
  it('parses multiple /track commands from one multiline message as separate commands', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] = privateApi.parseMessageCommands(
      [
        '/track 0x28C6c06298d514Db089934071355E5743bf21d60',
        'Binance_Cold_Wallet_1',
        '/track 0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
        'Binance_Cold_Wallet_2',
      ].join('\n'),
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      command: 'track',
      args: ['0x28C6c06298d514Db089934071355E5743bf21d60', 'Binance_Cold_Wallet_1'],
      lineNumber: 1,
    });
    expect(parsed[1]).toMatchObject({
      command: 'track',
      args: ['0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', 'Binance_Cold_Wallet_2'],
      lineNumber: 3,
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
      targetType: WalletCallbackTargetType.WALLET_ID,
      walletId: 16,
      muteMinutes: 1440,
    });
  });

  it('uses policy-aware history method for callback and returns cooldown error text', async (): Promise<void> => {
    const getAddressHistoryWithPolicyMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockRejectedValue(new Error('Слишком часто нажимаешь кнопку истории. Повтори через 2 сек.'));
    const trackingServiceStub = {
      getAddressHistoryWithPolicy: getAddressHistoryWithPolicyMock,
    } as unknown as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const answerCbQueryMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const replyMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ message_id: 777, text: 'ok' });
    const callbackContext = {
      callbackQuery: {
        data: 'wallet_history_addr:0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
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

    expect(getAddressHistoryWithPolicyMock).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
      '10',
      HistoryRequestSource.CALLBACK,
      HistoryKind.ALL,
      HistoryDirectionFilter.ALL,
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
