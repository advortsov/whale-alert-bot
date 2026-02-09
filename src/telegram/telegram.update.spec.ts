import { describe, expect, it } from 'vitest';

import { TelegramUpdate } from './telegram.update';
import type { TrackingService } from '../tracking/tracking.service';

type ParsedMessageCommandView = {
  readonly command: string;
  readonly args: readonly string[];
  readonly lineNumber: number;
};

type TelegramUpdatePrivateApi = {
  parseMessageCommands: (rawText: string) => readonly ParsedMessageCommandView[];
  parseWalletHistoryCallbackData: (callbackData: string) =>
    | {
        readonly targetType: 'wallet_id';
        readonly walletId: number;
      }
    | {
        readonly targetType: 'address';
        readonly walletAddress: string;
      }
    | null;
};

describe('TelegramUpdate', (): void => {
  it('parses multiple /track commands from one multiline message as separate commands', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = new TelegramUpdate(trackingServiceStub);
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
    const update: TelegramUpdate = new TelegramUpdate(trackingServiceStub);
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
    const update: TelegramUpdate = new TelegramUpdate(trackingServiceStub);
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

  it('parses menu button text into mapped command', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = new TelegramUpdate(trackingServiceStub);
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
    const update: TelegramUpdate = new TelegramUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const callbackTarget = privateApi.parseWalletHistoryCallbackData('wallet_history:15');

    expect(callbackTarget).toMatchObject({
      targetType: 'wallet_id',
      walletId: 15,
    });
  });

  it('parses wallet history callback data by address', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = new TelegramUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const callbackTarget = privateApi.parseWalletHistoryCallbackData(
      'wallet_history_addr:0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
    );

    expect(callbackTarget).toMatchObject({
      targetType: 'address',
      walletAddress: '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
    });
  });

  it('returns null for invalid wallet history callback data', (): void => {
    const trackingServiceStub: TrackingService = {} as TrackingService;
    const update: TelegramUpdate = new TelegramUpdate(trackingServiceStub);
    const privateApi: TelegramUpdatePrivateApi = update as unknown as TelegramUpdatePrivateApi;

    const callbackTarget = privateApi.parseWalletHistoryCallbackData('wallet_history:abc');

    expect(callbackTarget).toBeNull();
  });
});
