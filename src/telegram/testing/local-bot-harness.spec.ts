import { describe, expect, it, vi } from 'vitest';

import { LocalBotHarness } from './local-bot-harness';
import type { HarnessRunResult, HarnessUser } from './local-bot-harness.interfaces';
import type { RuntimeStatusService } from '../../runtime/runtime-status.service';
import { HistoryRequestSource } from '../../tracking/history-rate-limiter.interfaces';
import type { TrackingService } from '../../tracking/tracking.service';

type TrackingServiceStub = {
  readonly trackAddress: ReturnType<typeof vi.fn>;
  readonly listTrackedAddresses: ReturnType<typeof vi.fn>;
  readonly listTrackedWalletOptions: ReturnType<typeof vi.fn>;
  readonly untrackAddress: ReturnType<typeof vi.fn>;
  readonly getAddressHistoryWithPolicy: ReturnType<typeof vi.fn>;
  readonly getWalletDetails: ReturnType<typeof vi.fn>;
  readonly getUserStatus: ReturnType<typeof vi.fn>;
  readonly getUserAlertFilters: ReturnType<typeof vi.fn>;
  readonly setMinimumAlertAmount: ReturnType<typeof vi.fn>;
  readonly setMuteAlerts: ReturnType<typeof vi.fn>;
  readonly setEventTypeFilter: ReturnType<typeof vi.fn>;
};

type RuntimeStatusServiceStub = {
  readonly getSnapshot: ReturnType<typeof vi.fn>;
  readonly setSnapshot: ReturnType<typeof vi.fn>;
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
  getWalletDetails: vi.fn().mockResolvedValue('wallet details'),
  getUserStatus: vi.fn().mockResolvedValue('Пользовательский статус: ok'),
  getUserAlertFilters: vi.fn().mockResolvedValue('filters'),
  setMinimumAlertAmount: vi.fn().mockResolvedValue('setmin'),
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

describe('LocalBotHarness', (): void => {
  it('executes multiline /track commands as separate bot actions', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
    });
    const user: HarnessUser = {
      telegramId: '42',
      username: 'tester',
    };

    const result: HarnessRunResult = await harness.sendText({
      user,
      text: [
        '/track 0x28C6c06298d514Db089934071355E5743bf21d60 Binance_Cold_Wallet_1',
        '/track 0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8 Binance_Cold_Wallet_2',
      ].join('\n'),
    });

    expect(trackingServiceStub.trackAddress).toHaveBeenCalledTimes(2);
    expect(result.replies).toHaveLength(1);
    expect(result.replies[0]?.text).toContain('Обработано команд: 2');
    expect(result.replies[0]?.text).toContain('tracked 0x28C6c06298d514Db089934071355E5743bf21d60');
    expect(result.replies[0]?.text).toContain('tracked 0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8');
  });

  it('returns merged runtime and user status for /status', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
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
    expect(result.replies[0]?.text).toContain('observed block: 123');
    expect(result.replies[0]?.text).toContain('Пользовательский статус: ok');
  });

  it('routes callback history request with source=callback and HTML options', async (): Promise<void> => {
    const trackingServiceStub: TrackingServiceStub = createTrackingServiceStub();
    trackingServiceStub.getAddressHistoryWithPolicy.mockResolvedValue(
      '<b>История</b> callback result',
    );
    const runtimeStatusServiceStub: RuntimeStatusServiceStub = createRuntimeStatusServiceStub();
    const harness: LocalBotHarness = new LocalBotHarness({
      trackingService: trackingServiceStub as unknown as TrackingService,
      runtimeStatusService: runtimeStatusServiceStub as unknown as RuntimeStatusService,
    });
    const trackedAddress: string = '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0';

    const result: HarnessRunResult = await harness.sendCallback({
      user: {
        telegramId: '42',
        username: 'tester',
      },
      callbackData: `wallet_history_addr:${trackedAddress}`,
    });

    expect(result.callbackAnswers).toEqual([
      {
        text: 'Выполняю действие...',
      },
    ]);
    expect(trackingServiceStub.getAddressHistoryWithPolicy).toHaveBeenCalledWith(
      {
        telegramId: '42',
        username: 'tester',
      },
      trackedAddress,
      '10',
      HistoryRequestSource.CALLBACK,
    );
    expect(result.replies[0]?.options).toMatchObject({
      parse_mode: 'HTML',
    });
    expect(result.replies[0]?.text).toContain('История');
  });
});
