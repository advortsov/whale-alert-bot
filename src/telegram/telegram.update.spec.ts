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
});
