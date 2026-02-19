import { describe, expect, it, vi } from 'vitest';

import { LocalBotHarness } from './local-bot-harness';
import type { HarnessRunResult, HarnessUser } from './local-bot-harness.interfaces';
import { ChainKey } from '../../../../common/interfaces/chain-key.interfaces';
import type { AppConfigService } from '../../../../config/app-config.service';
import type { RuntimeStatusService } from '../../../../runtime/runtime-status.service';
import { HistoryRequestSource } from '../../../whales/entities/history-rate-limiter.interfaces';
import { HistoryDirectionFilter, HistoryKind } from '../../../whales/entities/history-request.dto';
import type { TrackingService } from '../../../whales/services/tracking.service';

type TrackingServiceStub = {
  readonly trackAddress: ReturnType<typeof vi.fn>;
  readonly listTrackedAddresses: ReturnType<typeof vi.fn>;
  readonly listTrackedWalletOptions: ReturnType<typeof vi.fn>;
  readonly untrackAddress: ReturnType<typeof vi.fn>;
  readonly getAddressHistoryWithPolicy: ReturnType<typeof vi.fn>;
  readonly getAddressHistoryPageWithPolicy: ReturnType<typeof vi.fn>;
  readonly getWalletDetails: ReturnType<typeof vi.fn>;
  readonly getUserStatus: ReturnType<typeof vi.fn>;
  readonly getUserAlertFilters: ReturnType<typeof vi.fn>;
  readonly setThresholdUsd: ReturnType<typeof vi.fn>;
  readonly setMinAmountUsd: ReturnType<typeof vi.fn>;
  readonly setCexFlowFilter: ReturnType<typeof vi.fn>;
  readonly setSmartFilterType: ReturnType<typeof vi.fn>;
  readonly setIncludeDexFilter: ReturnType<typeof vi.fn>;
  readonly setExcludeDexFilter: ReturnType<typeof vi.fn>;
  readonly setQuietHours: ReturnType<typeof vi.fn>;
  readonly setUserTimezone: ReturnType<typeof vi.fn>;
  readonly muteWalletAlertsForDuration: ReturnType<typeof vi.fn>;
  readonly setMuteAlerts: ReturnType<typeof vi.fn>;
  readonly setEventTypeFilter: ReturnType<typeof vi.fn>;
};

type RuntimeStatusServiceStub = {
  readonly getSnapshot: ReturnType<typeof vi.fn>;
  readonly setSnapshot: ReturnType<typeof vi.fn>;
};

type AppConfigServiceStub = {
  readonly appVersion: string;
};

const createTrackingServiceStub = (): TrackingServiceStub => ({
  trackAddress: vi
    .fn()
    .mockImplementation(
      async (_userRef: unknown, rawAddress: string, label: string | null): Promise<string> => {
        const normalizedLabel: string = label ?? 'n/a';
        return `tracked ${rawAddress} (${normalizedLabel})`;
      },
    ),
  listTrackedAddresses: vi.fn().mockResolvedValue('list'),
  listTrackedWalletOptions: vi.fn().mockResolvedValue([]),
  untrackAddress: vi.fn().mockResolvedValue('untrack'),
  getAddressHistoryWithPolicy: vi.fn().mockResolvedValue('history'),
  getAddressHistoryPageWithPolicy: vi.fn().mockResolvedValue({
    message: '<b>История</b> callback result',
    walletId: 16,
    offset: 0,
    limit: 10,
    hasNextPage: false,
    kind: HistoryKind.ALL,
    direction: HistoryDirectionFilter.ALL,
  }),
  getWalletDetails: vi.fn().mockResolvedValue('wallet details'),
  getUserStatus: vi.fn().mockResolvedValue('Пользовательский статус: ok'),
  getUserAlertFilters: vi.fn().mockResolvedValue('filters'),
  setThresholdUsd: vi.fn().mockResolvedValue('threshold'),
  setMinAmountUsd: vi.fn().mockResolvedValue('min_amount_usd'),
  setCexFlowFilter: vi.fn().mockResolvedValue('cex'),
  setSmartFilterType: vi.fn().mockResolvedValue('smart_type'),
  setIncludeDexFilter: vi.fn().mockResolvedValue('include_dex'),
  setExcludeDexFilter: vi.fn().mockResolvedValue('exclude_dex'),
  setQuietHours: vi.fn().mockResolvedValue('quiet'),
  setUserTimezone: vi.fn().mockResolvedValue('timezone'),
  muteWalletAlertsForDuration: vi.fn().mockResolvedValue('muted wallet'),
  setMuteAlerts: vi.fn().mockResolvedValue('mute'),
  setEventTypeFilter: vi.fn().mockResolvedValue('toggle filter'),
});

const createRuntimeStatusServiceStub = (): RuntimeStatusServiceStub => ({
  getSnapshot: vi.fn().mockReturnValue({
    observedBlock: 123,
    processedBlock: 121,
    lag: 2,
    queueSize: 4,
    backoffMs: 1000,
    confirmations: 2,
    updatedAtIso: '2026-02-09T20:00:00.000Z',
  }),
  setSnapshot: vi.fn(),
});

const createAppConfigServiceStub = (): AppConfigServiceStub => ({
  appVersion: '0.1.0-test',
});

describe('LocalBotHarness', (): void => {
  it('executes multiline /track commands as separate bot actions', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const appConfigServiceStub: AppConfigServiceStub = createAppConfigServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
      appConfigService: appConfigServiceStub as unknown as AppConfigService,
    });
    const user: HarnessUser = {
      telegramId: '42',
      username: 'tester',
    };

    const result: HarnessRunResult = await harness.sendText({
      user,
      text: [
        '/track eth 0x28C6c06298d514Db089934071355E5743bf21d60 Binance_Cold_Wallet_1',
        '/track eth 0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8 Binance_Cold_Wallet_2',
      ].join('\n'),
    });

    expect(trackingServiceStub.trackAddress).toHaveBeenCalledTimes(2);
    expect(trackingServiceStub.trackAddress).toHaveBeenNthCalledWith(
      1,
      {
        telegramId: '42',
        username: 'tester',
      },
      '0x28C6c06298d514Db089934071355E5743bf21d60',
      'Binance_Cold_Wallet_1',
      ChainKey.ETHEREUM_MAINNET,
    );
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0]?.text).toContain('Обработано команд: 2');
    expect(result.replies[0]?.text).toContain('tracked 0x28C6c06298d514Db089934071355E5743bf21d60');
    expect(result.replies[0]?.text).toContain('tracked 0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8');
  });

  it('routes /track sol with explicit chain key', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const appConfigServiceStub: AppConfigServiceStub = createAppConfigServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
      appConfigService: appConfigServiceStub as unknown as AppConfigService,
    });

    await harness.sendText({
      user: {
        telegramId: '42',
        username: 'tester',
      },
      text: '/track sol 11111111111111111111111111111111 system',
    });

    expect(trackingServiceStub.trackAddress).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      '11111111111111111111111111111111',
      'system',
      ChainKey.SOLANA_MAINNET,
    );
  });

  it('routes multiline /track sol when address and label are on separate lines', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const appConfigServiceStub: AppConfigServiceStub = createAppConfigServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
      appConfigService: appConfigServiceStub as unknown as AppConfigService,
    });

    await harness.sendText({
      user: {
        telegramId: '42',
        username: 'tester',
      },
      text: ['/track sol', 'GK3mWh4hdBokYhQ1tY4eVThdSvJvEkwL9wfadTmX6w5h', 'sol1'].join('\n'),
    });

    expect(trackingServiceStub.trackAddress).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      'GK3mWh4hdBokYhQ1tY4eVThdSvJvEkwL9wfadTmX6w5h',
      'sol1',
      ChainKey.SOLANA_MAINNET,
    );
  });

  it('routes /track tron with explicit chain key', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const appConfigServiceStub: AppConfigServiceStub = createAppConfigServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
      appConfigService: appConfigServiceStub as unknown as AppConfigService,
    });

    await harness.sendText({
      user: {
        telegramId: '42',
        username: 'tester',
      },
      text: '/track tron TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 treasury',
    });

    expect(trackingServiceStub.trackAddress).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
      'treasury',
      ChainKey.TRON_MAINNET,
    );
  });

  it('returns merged runtime and user status for /status', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const appConfigServiceStub: AppConfigServiceStub = createAppConfigServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
      appConfigService: appConfigServiceStub as unknown as AppConfigService,
    });

    const result: HarnessRunResult = await harness.sendText({
      user: {
        telegramId: '42',
        username: 'tester',
      },
      text: '/status',
    });

    expect(result.replies).toHaveLength(1);
    expect(result.replies[0]?.text).toContain('Runtime watcher status');
    expect(result.replies[0]?.text).toContain('app version: 0.1.0-test');
    expect(result.replies[0]?.text).toContain('observed block: 123');
    expect(result.replies[0]?.text).toContain('Пользовательский статус: ok');
  });

  it('routes callback history request with source=callback and HTML options', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const appConfigServiceStub: AppConfigServiceStub = createAppConfigServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
      appConfigService: appConfigServiceStub as unknown as AppConfigService,
    });
    const result: HarnessRunResult = await harness.sendCallback({
      user: {
        telegramId: '42',
        username: 'tester',
      },
      callbackData: 'wallet_history:16',
    });

    expect(result.callbackAnswers).toEqual([
      {
        text: 'Выполняю действие...',
      },
    ]);
    expect(trackingServiceStub.getAddressHistoryPageWithPolicy).toHaveBeenCalledWith(
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
    expect(result.replies[0]?.options).toMatchObject({
      parse_mode: 'HTML',
    });
    expect(result.replies[0]?.text).toContain('История');
  });

  it('handles /filter cex command and routes to tracking service', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const appConfigServiceStub: AppConfigServiceStub = createAppConfigServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
      appConfigService: appConfigServiceStub as unknown as AppConfigService,
    });

    await harness.sendText({
      user: {
        telegramId: '42',
        username: 'tester',
      },
      text: '/filter cex out',
    });

    expect(trackingServiceStub.setCexFlowFilter).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      'out',
    );
  });

  it('returns wallet card keyboard with tap-only actions', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    trackingServiceStub.getWalletDetails.mockResolvedValue('wallet card');
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const appConfigServiceStub: AppConfigServiceStub = createAppConfigServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
      appConfigService: appConfigServiceStub as unknown as AppConfigService,
    });

    const result: HarnessRunResult = await harness.sendText({
      user: {
        telegramId: '42',
        username: 'tester',
      },
      text: '/wallet #16',
    });

    const replyOptions = result.replies[0]?.options as
      | {
          readonly reply_markup?: {
            readonly inline_keyboard?: readonly (readonly { readonly callback_data?: string }[])[];
          };
        }
      | null
      | undefined;
    const inlineKeyboard: readonly (readonly { readonly callback_data?: string }[])[] =
      replyOptions?.reply_markup?.inline_keyboard ?? [];
    const callbackDataList: string[] = [];

    for (const row of inlineKeyboard) {
      for (const button of row) {
        if (typeof button.callback_data === 'string') {
          callbackDataList.push(button.callback_data);
        }
      }
    }

    expect(callbackDataList).toContain('wallet_history_refresh:16:10:all:all');
    expect(callbackDataList).toContain('wallet_history_refresh:16:10:erc20:all');
    expect(callbackDataList).toContain('wallet_filters:16');
    expect(callbackDataList).toContain('wallet_menu:16');
    expect(callbackDataList).toContain('wallet_untrack:16');
  });
});
