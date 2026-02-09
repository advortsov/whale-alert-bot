import type { Context } from 'telegraf';
import { describe, expect, it, vi } from 'vitest';

import {
  WalletCallbackAction,
  WalletCallbackTargetType,
  type WalletCallbackTarget,
} from './telegram.interfaces';
import { TelegramUpdate } from './telegram.update';
import type { RuntimeStatusService } from '../runtime/runtime-status.service';
import { HistoryRequestSource } from '../tracking/history-rate-limiter.interfaces';
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

  it('parses /history command with limit argument', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] = privateApi.parseMessageCommands(
      '/history 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 7',
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'history',
      args: ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '7'],
      lineNumber: 1,
    });
  });

  it('parses /history command with wallet id argument', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] =
      privateApi.parseMessageCommands('/history #3 10');

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'history',
      args: ['#3', '10'],
      lineNumber: 1,
    });
  });

  it('parses /filters command with toggle args', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] =
      privateApi.parseMessageCommands('/filters transfer off');

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'filters',
      args: ['transfer', 'off'],
      lineNumber: 1,
    });
  });

  it('parses /setmin command with amount arg', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] =
      privateApi.parseMessageCommands('/setmin 1000.5');

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'setmin',
      args: ['1000.5'],
      lineNumber: 1,
    });
  });

  it('parses /wallet command with wallet id', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] =
      privateApi.parseMessageCommands('/wallet #12');

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'wallet',
      args: ['#12'],
      lineNumber: 1,
    });
  });

  it('parses /status command', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] = privateApi.parseMessageCommands('/status');

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'status',
      args: [],
      lineNumber: 1,
    });
  });

  it('parses menu button text into mapped command', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const parsed: readonly ParsedMessageCommandView[] =
      privateApi.parseMessageCommands('📋 Мой список');

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      command: 'list',
      args: [],
      lineNumber: 1,
    });
  });

  it('parses wallet history callback data by wallet id', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const callbackTarget = privateApi.parseWalletCallbackData('wallet_history:15');

    expect(callbackTarget).toMatchObject({
      action: WalletCallbackAction.HISTORY,
      targetType: WalletCallbackTargetType.WALLET_ID,
      walletId: 15,
    });
  });

  it('parses wallet history callback data by address', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const callbackTarget = privateApi.parseWalletCallbackData(
      'wallet_history_addr:0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
    );

    expect(callbackTarget).toMatchObject({
      action: WalletCallbackAction.HISTORY,
      targetType: WalletCallbackTargetType.ADDRESS,
      walletAddress: '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
    });
  });

  it('parses wallet menu callback by wallet id', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const callbackTarget = privateApi.parseWalletCallbackData('wallet_menu:7');

    expect(callbackTarget).toMatchObject({
      action: WalletCallbackAction.MENU,
      targetType: WalletCallbackTargetType.WALLET_ID,
      walletId: 7,
    });
  });

  it('returns null for invalid wallet history callback data', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = createUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const callbackTarget = privateApi.parseWalletCallbackData('wallet_history:abc');

    expect(callbackTarget).toBeNull();
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

    const firstReplyCall: unknown[] | undefined = replyMock.mock.calls[0];
    const replyOptions: unknown = firstReplyCall?.[1];
    expect(typeof replyOptions).toBe('object');
    expect(replyOptions).not.toBeNull();
  });
});
