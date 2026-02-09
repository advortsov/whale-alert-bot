import { describe, expect, it, vi } from 'vitest';

import type { EtherscanHistoryService } from './etherscan-history.service';
import type { HistoryCacheService } from './history-cache.service';
import {
  HistoryRateLimitReason,
  HistoryRequestSource,
  type HistoryRateLimitDecision,
} from './history-rate-limiter.interfaces';
import type { HistoryRateLimiterService } from './history-rate-limiter.service';
import type { TelegramUserRef } from './tracking.interfaces';
import { TrackingService } from './tracking.service';
import type { AppConfigService } from '../config/app-config.service';
import type { UserRow } from '../storage/database.types';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { TrackedWalletsRepository } from '../storage/repositories/tracked-wallets.repository';
import type { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import type { UsersRepository } from '../storage/repositories/users.repository';

type SubscriptionsRepositoryStub = {
  readonly addSubscription: ReturnType<typeof vi.fn>;
  readonly listByUserId: ReturnType<typeof vi.fn>;
  readonly removeByWalletId: ReturnType<typeof vi.fn>;
  readonly removeByAddress: ReturnType<typeof vi.fn>;
};

type UsersRepositoryStub = {
  readonly findOrCreate: ReturnType<typeof vi.fn>;
};

type TrackedWalletsRepositoryStub = {
  readonly findOrCreate: ReturnType<typeof vi.fn>;
};

type EtherscanHistoryServiceStub = {
  readonly loadRecentTransactions: ReturnType<typeof vi.fn>;
};

type AppConfigServiceStub = {
  readonly etherscanTxBaseUrl: string;
};

type HistoryCacheServiceStub = {
  readonly getFresh: ReturnType<typeof vi.fn>;
  readonly getStale: ReturnType<typeof vi.fn>;
  readonly set: ReturnType<typeof vi.fn>;
};

type HistoryRateLimiterServiceStub = {
  readonly evaluate: ReturnType<typeof vi.fn>;
};

type UserAlertPreferencesRepositoryStub = {
  readonly findOrCreateByUserId: ReturnType<typeof vi.fn>;
  readonly updateMinAmount: ReturnType<typeof vi.fn>;
  readonly updateMute: ReturnType<typeof vi.fn>;
  readonly updateEventType: ReturnType<typeof vi.fn>;
};

type TestContext = {
  readonly userRef: TelegramUserRef;
  readonly userRow: UserRow;
  readonly usersRepositoryStub: UsersRepositoryStub;
  readonly trackedWalletsRepositoryStub: TrackedWalletsRepositoryStub;
  readonly subscriptionsRepositoryStub: SubscriptionsRepositoryStub;
  readonly etherscanHistoryServiceStub: EtherscanHistoryServiceStub;
  readonly historyCacheServiceStub: HistoryCacheServiceStub;
  readonly historyRateLimiterServiceStub: HistoryRateLimiterServiceStub;
  readonly userAlertPreferencesRepositoryStub: UserAlertPreferencesRepositoryStub;
  readonly appConfigServiceStub: AppConfigServiceStub;
  readonly service: TrackingService;
};

const allowDecision: HistoryRateLimitDecision = {
  allowed: true,
  retryAfterSec: null,
  reason: HistoryRateLimitReason.OK,
};

const createTestContext = (): TestContext => {
  const usersRepositoryStub: UsersRepositoryStub = {
    findOrCreate: vi.fn(),
  };
  const trackedWalletsRepositoryStub: TrackedWalletsRepositoryStub = {
    findOrCreate: vi.fn(),
  };
  const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
    addSubscription: vi.fn(),
    listByUserId: vi.fn(),
    removeByWalletId: vi.fn(),
    removeByAddress: vi.fn(),
  };
  const etherscanHistoryServiceStub: EtherscanHistoryServiceStub = {
    loadRecentTransactions: vi.fn(),
  };
  const historyCacheServiceStub: HistoryCacheServiceStub = {
    getFresh: vi.fn(),
    getStale: vi.fn(),
    set: vi.fn(),
  };
  const historyRateLimiterServiceStub: HistoryRateLimiterServiceStub = {
    evaluate: vi.fn(),
  };
  const userAlertPreferencesRepositoryStub: UserAlertPreferencesRepositoryStub = {
    findOrCreateByUserId: vi.fn(),
    updateMinAmount: vi.fn(),
    updateMute: vi.fn(),
    updateEventType: vi.fn(),
  };
  const appConfigServiceStub: AppConfigServiceStub = {
    etherscanTxBaseUrl: 'https://etherscan.io/tx/',
  };

  const userRef: TelegramUserRef = {
    telegramId: '42',
    username: 'tester',
  };
  const userRow: UserRow = {
    id: 7,
    telegram_id: '42',
    username: 'tester',
    created_at: new Date('2026-02-01T00:00:00.000Z'),
  };

  usersRepositoryStub.findOrCreate.mockResolvedValue(userRow);
  historyRateLimiterServiceStub.evaluate.mockReturnValue(allowDecision);
  userAlertPreferencesRepositoryStub.findOrCreateByUserId.mockResolvedValue({
    id: 1,
    user_id: 7,
    min_amount: 0,
    allow_transfer: true,
    allow_swap: true,
    muted_until: null,
    created_at: new Date('2026-02-01T00:00:00.000Z'),
    updated_at: new Date('2026-02-01T00:00:00.000Z'),
  });
  userAlertPreferencesRepositoryStub.updateMinAmount.mockResolvedValue({
    id: 1,
    user_id: 7,
    min_amount: 1000.5,
    allow_transfer: true,
    allow_swap: true,
    muted_until: null,
    created_at: new Date('2026-02-01T00:00:00.000Z'),
    updated_at: new Date('2026-02-01T00:00:00.000Z'),
  });
  userAlertPreferencesRepositoryStub.updateMute.mockResolvedValue({
    id: 1,
    user_id: 7,
    min_amount: 0,
    allow_transfer: true,
    allow_swap: true,
    muted_until: new Date('2026-02-01T01:00:00.000Z'),
    created_at: new Date('2026-02-01T00:00:00.000Z'),
    updated_at: new Date('2026-02-01T00:00:00.000Z'),
  });

  const service: TrackingService = new TrackingService(
    usersRepositoryStub as unknown as UsersRepository,
    trackedWalletsRepositoryStub as unknown as TrackedWalletsRepository,
    subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
    etherscanHistoryServiceStub as unknown as EtherscanHistoryService,
    historyCacheServiceStub as unknown as HistoryCacheService,
    historyRateLimiterServiceStub as unknown as HistoryRateLimiterService,
    userAlertPreferencesRepositoryStub as unknown as UserAlertPreferencesRepository,
    appConfigServiceStub as unknown as AppConfigService,
  );

  return {
    userRef,
    userRow,
    usersRepositoryStub,
    trackedWalletsRepositoryStub,
    subscriptionsRepositoryStub,
    etherscanHistoryServiceStub,
    historyCacheServiceStub,
    historyRateLimiterServiceStub,
    userAlertPreferencesRepositoryStub,
    appConfigServiceStub,
    service,
  };
};

describe('TrackingService', (): void => {
  it('returns cached history without etherscan call on fresh cache hit', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 3,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        walletLabel: 'vitalik',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.historyCacheServiceStub.getFresh.mockReturnValue({
      key: {
        address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        limit: 5,
      },
      message: 'cached history message',
      createdAtEpochMs: 1000,
      freshUntilEpochMs: 2000,
      staleUntilEpochMs: 3000,
    });

    const message: string = await context.service.getAddressHistoryWithPolicy(
      context.userRef,
      '#3',
      '5',
      HistoryRequestSource.COMMAND,
    );

    expect(message).toBe('cached history message');
    expect(context.etherscanHistoryServiceStub.loadRecentTransactions).not.toHaveBeenCalled();
    expect(context.historyCacheServiceStub.getFresh).toHaveBeenCalledWith(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      5,
    );
  });

  it('fetches history and stores cache on miss', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.historyCacheServiceStub.getFresh.mockReturnValue(null);
    context.etherscanHistoryServiceStub.loadRecentTransactions.mockResolvedValue([
      {
        hash: '0xabc',
        from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        to: '0x0000000000000000000000000000000000000001',
        valueRaw: '1000000000000000000',
        isError: false,
        timestampSec: 1739160000,
        assetSymbol: 'ETH',
        assetDecimals: 18,
      },
    ]);

    const message: string = await context.service.getAddressHistoryWithPolicy(
      context.userRef,
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      '5',
      HistoryRequestSource.COMMAND,
    );

    expect(context.etherscanHistoryServiceStub.loadRecentTransactions).toHaveBeenCalledWith(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      5,
    );
    expect(context.historyCacheServiceStub.set).toHaveBeenCalledTimes(1);
    expect(message).toContain('<a href="https://etherscan.io/tx/0xabc">Tx #1</a>');
  });

  it('serves stale cache entry when request is rate limited', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 3,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        walletLabel: 'vitalik',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.historyRateLimiterServiceStub.evaluate.mockReturnValue({
      allowed: false,
      retryAfterSec: 5,
      reason: HistoryRateLimitReason.MINUTE_LIMIT,
    });
    context.historyCacheServiceStub.getStale.mockReturnValue({
      key: {
        address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        limit: 5,
      },
      message: 'stale history message',
      createdAtEpochMs: 1000,
      freshUntilEpochMs: 2000,
      staleUntilEpochMs: 3000,
    });

    const message: string = await context.service.getAddressHistoryWithPolicy(
      context.userRef,
      '#3',
      '5',
      HistoryRequestSource.COMMAND,
    );

    expect(message).toContain('Показал кешированную историю');
    expect(message).toContain('stale history message');
    expect(context.etherscanHistoryServiceStub.loadRecentTransactions).not.toHaveBeenCalled();
  });

  it('returns readable retry error when rate limited and stale cache is missing', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 3,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        walletLabel: 'vitalik',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.historyRateLimiterServiceStub.evaluate.mockReturnValue({
      allowed: false,
      retryAfterSec: 4,
      reason: HistoryRateLimitReason.MINUTE_LIMIT,
    });
    context.historyCacheServiceStub.getStale.mockReturnValue(null);

    await expect(
      context.service.getAddressHistoryWithPolicy(
        context.userRef,
        '#3',
        '5',
        HistoryRequestSource.COMMAND,
      ),
    ).rejects.toThrow('Слишком много запросов к истории. Повтори через 4 сек.');
  });

  it('updates minimum alert amount for user preferences', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.setMinimumAlertAmount(context.userRef, '1000.5');

    expect(context.userAlertPreferencesRepositoryStub.updateMinAmount).toHaveBeenCalledWith(
      context.userRow.id,
      1000.5,
    );
    expect(message).toContain('1000.500000');
  });

  it('returns readable filters snapshot for user', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.getUserAlertFilters(context.userRef);

    expect(context.userAlertPreferencesRepositoryStub.findOrCreateByUserId).toHaveBeenCalledWith(
      context.userRow.id,
    );
    expect(message).toContain('Текущие фильтры алертов');
    expect(message).toContain('transfer: on');
  });

  it('returns wallet details by wallet id', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 9,
        walletAddress: '0x2F0b23f53734252Bda2277357e97e1517d6B042A',
        walletLabel: 'Maker_ETH_Vault',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const message: string = await context.service.getWalletDetails(context.userRef, '#9');

    expect(message).toContain('Кошелек #9');
    expect(message).toContain('Maker_ETH_Vault');
    expect(message).toContain('/history #9 10');
  });
});
