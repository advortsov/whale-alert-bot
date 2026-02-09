import { describe, expect, it, vi } from 'vitest';

import type { EtherscanHistoryService } from './etherscan-history.service';
import type { HistoryCacheService } from './history-cache.service';
import {
  HistoryRateLimitReason,
  HistoryRequestSource,
  type HistoryRateLimitDecision,
} from './history-rate-limiter.interfaces';
import type { HistoryRateLimiterService } from './history-rate-limiter.service';
import { AlertFilterToggleTarget, type TelegramUserRef } from './tracking.interfaces';
import { TrackingService } from './tracking.service';
import type { AppConfigService } from '../config/app-config.service';
import type { UserRow } from '../storage/database.types';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { TrackedWalletsRepository } from '../storage/repositories/tracked-wallets.repository';
import type { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import type { UserWalletAlertPreferencesRepository } from '../storage/repositories/user-wallet-alert-preferences.repository';
import type { UsersRepository } from '../storage/repositories/users.repository';
import type { WalletEventsRepository } from '../storage/repositories/wallet-events.repository';

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
  readonly getSnapshot: ReturnType<typeof vi.fn>;
};

type UserAlertPreferencesRepositoryStub = {
  readonly findOrCreateByUserId: ReturnType<typeof vi.fn>;
  readonly updateMinAmount: ReturnType<typeof vi.fn>;
  readonly updateMute: ReturnType<typeof vi.fn>;
  readonly updateEventType: ReturnType<typeof vi.fn>;
};

type UserWalletAlertPreferencesRepositoryStub = {
  readonly findByUserAndWalletId: ReturnType<typeof vi.fn>;
  readonly updateEventType: ReturnType<typeof vi.fn>;
};

type WalletEventsRepositoryStub = {
  readonly listRecentByTrackedAddress: ReturnType<typeof vi.fn>;
  readonly saveEvent: ReturnType<typeof vi.fn>;
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
  readonly userWalletAlertPreferencesRepositoryStub: UserWalletAlertPreferencesRepositoryStub;
  readonly walletEventsRepositoryStub: WalletEventsRepositoryStub;
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
    getSnapshot: vi.fn(),
  };
  const userAlertPreferencesRepositoryStub: UserAlertPreferencesRepositoryStub = {
    findOrCreateByUserId: vi.fn(),
    updateMinAmount: vi.fn(),
    updateMute: vi.fn(),
    updateEventType: vi.fn(),
  };
  const userWalletAlertPreferencesRepositoryStub: UserWalletAlertPreferencesRepositoryStub = {
    findByUserAndWalletId: vi.fn(),
    updateEventType: vi.fn(),
  };
  const walletEventsRepositoryStub: WalletEventsRepositoryStub = {
    listRecentByTrackedAddress: vi.fn(),
    saveEvent: vi.fn(),
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
  historyRateLimiterServiceStub.getSnapshot.mockReturnValue({
    minuteLimit: 12,
    minuteUsed: 2,
    minuteRemaining: 10,
    callbackCooldownSec: 3,
    callbackRetryAfterSec: 0,
  });
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
  userWalletAlertPreferencesRepositoryStub.findByUserAndWalletId.mockResolvedValue(null);
  userWalletAlertPreferencesRepositoryStub.updateEventType.mockResolvedValue({
    id: 1,
    user_id: 7,
    wallet_id: 9,
    allow_transfer: true,
    allow_swap: false,
    created_at: new Date('2026-02-01T00:00:00.000Z'),
    updated_at: new Date('2026-02-01T00:00:00.000Z'),
  });
  walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([]);

  const service: TrackingService = new TrackingService(
    usersRepositoryStub as unknown as UsersRepository,
    trackedWalletsRepositoryStub as unknown as TrackedWalletsRepository,
    subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
    etherscanHistoryServiceStub as unknown as EtherscanHistoryService,
    historyCacheServiceStub as unknown as HistoryCacheService,
    historyRateLimiterServiceStub as unknown as HistoryRateLimiterService,
    userAlertPreferencesRepositoryStub as unknown as UserAlertPreferencesRepository,
    userWalletAlertPreferencesRepositoryStub as unknown as UserWalletAlertPreferencesRepository,
    walletEventsRepositoryStub as unknown as WalletEventsRepository,
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
    userWalletAlertPreferencesRepositoryStub,
    walletEventsRepositoryStub,
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
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([]);
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

  it('returns local database history before etherscan fallback', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.historyCacheServiceStub.getFresh.mockReturnValue(null);
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([
      {
        chainId: 1,
        txHash: '0xlocal',
        logIndex: 1,
        trackedAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        eventType: 'TRANSFER',
        direction: 'OUT',
        contractAddress: '0x1111111111111111111111111111111111111111',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        tokenSymbol: 'USDT',
        tokenDecimals: 6,
        tokenAmountRaw: '5000000',
        valueFormatted: '5.0',
        dex: null,
        pair: null,
        occurredAt: new Date('2026-02-09T12:00:00.000Z'),
      },
    ]);

    const message: string = await context.service.getAddressHistoryWithPolicy(
      context.userRef,
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      '5',
      HistoryRequestSource.COMMAND,
    );

    expect(message).toContain('Локальные события');
    expect(message).toContain('Tx #1');
    expect(context.etherscanHistoryServiceStub.loadRecentTransactions).not.toHaveBeenCalled();
    expect(context.historyCacheServiceStub.set).toHaveBeenCalledTimes(1);
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

  it('returns wallet alert filter state with global defaults when override is missing', async (): Promise<void> => {
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
    context.userWalletAlertPreferencesRepositoryStub.findByUserAndWalletId.mockResolvedValue(null);

    const state = await context.service.getWalletAlertFilterState(context.userRef, '#9');

    expect(state.walletId).toBe(9);
    expect(state.walletLabel).toBe('Maker_ETH_Vault');
    expect(state.allowTransfer).toBe(true);
    expect(state.allowSwap).toBe(true);
    expect(state.hasWalletOverride).toBe(false);
  });

  it('updates wallet filter and returns overridden state', async (): Promise<void> => {
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
    context.userWalletAlertPreferencesRepositoryStub.findByUserAndWalletId.mockResolvedValue({
      id: 1,
      user_id: 7,
      wallet_id: 9,
      allow_transfer: false,
      allow_swap: true,
      created_at: new Date('2026-02-01T00:00:00.000Z'),
      updated_at: new Date('2026-02-01T00:00:00.000Z'),
    });

    const state = await context.service.setWalletEventTypeFilter(
      context.userRef,
      '#9',
      AlertFilterToggleTarget.TRANSFER,
      false,
    );

    expect(context.userWalletAlertPreferencesRepositoryStub.updateEventType).toHaveBeenCalledWith(
      7,
      9,
      'transfer',
      false,
    );
    expect(state.allowTransfer).toBe(false);
    expect(state.hasWalletOverride).toBe(true);
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

  it('returns wallet details when repository returns wallet id as string', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: '16' as unknown as number,
        walletAddress: '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
        walletLabel: 'my_wallet',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const message: string = await context.service.getWalletDetails(context.userRef, '#16');

    expect(message).toContain('Кошелек #16');
    expect(message).toContain('my_wallet');
    expect(message).toContain('/history #16 10');
  });

  it('resolves /history #id when repository returns wallet id as string', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.historyCacheServiceStub.getFresh.mockReturnValue({
      key: {
        address: '0x96b0dc619a86572524c15c1fc9c42da9a94bcaa0',
        limit: 5,
      },
      message: 'cached by string wallet id',
      createdAtEpochMs: 1000,
      freshUntilEpochMs: 2000,
      staleUntilEpochMs: 3000,
    });
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: '16' as unknown as number,
        walletAddress: '0x96b0Dc619A86572524c15C1fC9c42DA9A94BCAa0',
        walletLabel: 'my_wallet',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const message: string = await context.service.getAddressHistoryWithPolicy(
      context.userRef,
      '#16',
      '5',
      HistoryRequestSource.COMMAND,
    );

    expect(message).toBe('cached by string wallet id');
    expect(context.etherscanHistoryServiceStub.loadRecentTransactions).not.toHaveBeenCalled();
  });

  it('returns paged local history with navigation metadata', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.historyCacheServiceStub.getFresh.mockReturnValue(null);
    context.walletEventsRepositoryStub.listRecentByTrackedAddress
      .mockResolvedValueOnce([
        {
          chainId: 1,
          txHash: '0xpage0',
          logIndex: 1,
          trackedAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          eventType: 'TRANSFER',
          direction: 'OUT',
          contractAddress: '0x1111111111111111111111111111111111111111',
          tokenAddress: '0x1111111111111111111111111111111111111111',
          tokenSymbol: 'USDT',
          tokenDecimals: 6,
          tokenAmountRaw: '1000000',
          valueFormatted: '1.0',
          dex: null,
          pair: null,
          occurredAt: new Date('2026-02-09T12:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          chainId: 1,
          txHash: '0xpage0',
          logIndex: 1,
          trackedAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          eventType: 'TRANSFER',
          direction: 'OUT',
          contractAddress: '0x1111111111111111111111111111111111111111',
          tokenAddress: '0x1111111111111111111111111111111111111111',
          tokenSymbol: 'USDT',
          tokenDecimals: 6,
          tokenAmountRaw: '1000000',
          valueFormatted: '1.0',
          dex: null,
          pair: null,
          occurredAt: new Date('2026-02-09T12:00:00.000Z'),
        },
        {
          chainId: 1,
          txHash: '0xprobe',
          logIndex: 2,
          trackedAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          eventType: 'TRANSFER',
          direction: 'IN',
          contractAddress: '0x1111111111111111111111111111111111111111',
          tokenAddress: '0x1111111111111111111111111111111111111111',
          tokenSymbol: 'USDT',
          tokenDecimals: 6,
          tokenAmountRaw: '2000000',
          valueFormatted: '2.0',
          dex: null,
          pair: null,
          occurredAt: new Date('2026-02-09T11:00:00.000Z'),
        },
      ]);

    const result = await context.service.getAddressHistoryPageWithPolicy(
      context.userRef,
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      '1',
      '0',
      HistoryRequestSource.CALLBACK,
    );

    expect(result.walletId).toBeNull();
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(0);
    expect(result.hasNextPage).toBe(true);
    expect(result.message).toContain('Локальные события 1-1');
  });

  it('returns user status with quota snapshot', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.getUserStatus(context.userRef);

    expect(context.historyRateLimiterServiceStub.getSnapshot).toHaveBeenCalledWith(
      context.userRef.telegramId,
    );
    expect(message).toContain('Пользовательский статус');
    expect(message).toContain('history quota: 2/12');
  });
});
