import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TmaInitService } from './tma-init.service';
import type { UsersRepository } from '../../../database/repositories/users.repository';
import type { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import type { TrackingService } from '../../whales/services/tracking.service';

describe('TmaInitService', () => {
  const userRef: TelegramUserRef = {
    telegramId: '42',
    username: 'tester',
  };

  const trackingServiceStub = {
    listWallets: vi.fn(),
    getSettings: vi.fn(),
  } as unknown as TrackingService;

  const usersRepositoryStub = {
    findOrCreate: vi.fn(),
  } as unknown as UsersRepository;

  const walletEventsRepositoryStub = {
    countTodayEventsByUser: vi.fn(),
  } as unknown as WalletEventsRepository;

  let service: TmaInitService;

  beforeEach((): void => {
    vi.clearAllMocks();
    service = new TmaInitService(
      trackingServiceStub,
      usersRepositoryStub,
      walletEventsRepositoryStub,
    );
  });

  it('returns aggregated init payload', async (): Promise<void> => {
    const wallets = { wallets: [], totalCount: 0 };
    const settings = {
      preferences: {
        minAmount: 0,
        allowTransfer: true,
        allowSwap: true,
        mutedUntil: null,
      },
      settings: {
        thresholdUsd: 0,
        minAmountUsd: 0,
        cexFlowMode: 'off',
        smartFilterType: 'all',
        includeDexes: [],
        excludeDexes: [],
        quietHoursFrom: null,
        quietHoursTo: null,
        timezone: 'UTC',
      },
    };

    usersRepositoryStub.findOrCreate = vi.fn().mockResolvedValue({ id: 7 });
    trackingServiceStub.listWallets = vi.fn().mockResolvedValue(wallets);
    trackingServiceStub.getSettings = vi.fn().mockResolvedValue(settings);
    walletEventsRepositoryStub.countTodayEventsByUser = vi.fn().mockResolvedValue(12);

    const result = await service.loadInitData(userRef);

    expect(result.wallets).toEqual(wallets);
    expect(result.settings).toEqual(settings);
    expect(result.todayAlertCount).toBe(12);
    expect(usersRepositoryStub.findOrCreate).toHaveBeenCalledWith('42', 'tester');
    expect(walletEventsRepositoryStub.countTodayEventsByUser).toHaveBeenCalledWith(7);
  });

  it('throws when user lookup fails', async (): Promise<void> => {
    usersRepositoryStub.findOrCreate = vi.fn().mockRejectedValue(new Error('db error'));

    await expect(service.loadInitData(userRef)).rejects.toThrow('db error');
  });
});
