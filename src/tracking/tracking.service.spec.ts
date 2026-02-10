import { describe, expect, it, vi } from 'vitest';

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
import { ChainKey } from '../core/chains/chain-key.interfaces';
import type { IAddressCodecRegistry } from '../core/ports/address/address-codec-registry.interfaces';
import type { IAddressCodec } from '../core/ports/address/address-codec.interfaces';
import type { IHistoryExplorerAdapter } from '../core/ports/explorers/history-explorer.interfaces';
import { HistoryDirection, HistoryItemType } from '../features/tracking/dto/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';
import type { AlertMutesRepository } from '../storage/repositories/alert-mutes.repository';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { TrackedWalletsRepository } from '../storage/repositories/tracked-wallets.repository';
import type { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import type { UserAlertSettingsRepository } from '../storage/repositories/user-alert-settings.repository';
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

type HistoryExplorerAdapterStub = {
  readonly loadRecentTransactions: ReturnType<typeof vi.fn>;
};

type AddressCodecRegistryStub = {
  readonly getCodec: ReturnType<typeof vi.fn>;
};

type AppConfigServiceStub = {
  readonly etherscanTxBaseUrl: string;
  readonly tronscanTxBaseUrl: string;
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
  readonly updateMute: ReturnType<typeof vi.fn>;
  readonly updateEventType: ReturnType<typeof vi.fn>;
};

type UserAlertSettingsRepositoryStub = {
  readonly findOrCreateByUserAndChain: ReturnType<typeof vi.fn>;
  readonly updateByUserAndChain: ReturnType<typeof vi.fn>;
};

type UserWalletAlertPreferencesRepositoryStub = {
  readonly findByUserAndWalletId: ReturnType<typeof vi.fn>;
  readonly updateEventType: ReturnType<typeof vi.fn>;
};

type AlertMutesRepositoryStub = {
  readonly findActiveMute: ReturnType<typeof vi.fn>;
  readonly upsertMute: ReturnType<typeof vi.fn>;
};

type WalletEventsRepositoryStub = {
  readonly listRecentByTrackedAddress: ReturnType<typeof vi.fn>;
};

type TestContext = {
  readonly userRef: TelegramUserRef;
  readonly usersRepositoryStub: UsersRepositoryStub;
  readonly trackedWalletsRepositoryStub: TrackedWalletsRepositoryStub;
  readonly subscriptionsRepositoryStub: SubscriptionsRepositoryStub;
  readonly historyExplorerAdapterStub: HistoryExplorerAdapterStub;
  readonly addressCodecRegistryStub: AddressCodecRegistryStub;
  readonly historyCacheServiceStub: HistoryCacheServiceStub;
  readonly historyRateLimiterServiceStub: HistoryRateLimiterServiceStub;
  readonly userAlertPreferencesRepositoryStub: UserAlertPreferencesRepositoryStub;
  readonly userAlertSettingsRepositoryStub: UserAlertSettingsRepositoryStub;
  readonly userWalletAlertPreferencesRepositoryStub: UserWalletAlertPreferencesRepositoryStub;
  readonly alertMutesRepositoryStub: AlertMutesRepositoryStub;
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
  const historyExplorerAdapterStub: HistoryExplorerAdapterStub = {
    loadRecentTransactions: vi.fn(),
  };
  const addressCodecRegistryStub: AddressCodecRegistryStub = {
    getCodec: vi.fn(),
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
    updateMute: vi.fn(),
    updateEventType: vi.fn(),
  };
  const userAlertSettingsRepositoryStub: UserAlertSettingsRepositoryStub = {
    findOrCreateByUserAndChain: vi.fn(),
    updateByUserAndChain: vi.fn(),
  };
  const userWalletAlertPreferencesRepositoryStub: UserWalletAlertPreferencesRepositoryStub = {
    findByUserAndWalletId: vi.fn(),
    updateEventType: vi.fn(),
  };
  const alertMutesRepositoryStub: AlertMutesRepositoryStub = {
    findActiveMute: vi.fn(),
    upsertMute: vi.fn(),
  };
  const walletEventsRepositoryStub: WalletEventsRepositoryStub = {
    listRecentByTrackedAddress: vi.fn(),
  };
  const appConfigServiceStub: AppConfigServiceStub = {
    etherscanTxBaseUrl: 'https://etherscan.io/tx/',
    tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
  };

  const ethereumAddressCodecStub: IAddressCodec = {
    validate: (): boolean => true,
    normalize: (rawAddress: string): string => rawAddress.trim(),
    formatShort: (address: string): string => address,
  };
  const solanaAddressCodecStub: IAddressCodec = {
    validate: (): boolean => true,
    normalize: (rawAddress: string): string => rawAddress.trim(),
    formatShort: (address: string): string => address,
  };
  const tronAddressCodecStub: IAddressCodec = {
    validate: (): boolean => true,
    normalize: (rawAddress: string): string => rawAddress.trim(),
    formatShort: (address: string): string => address,
  };
  addressCodecRegistryStub.getCodec.mockImplementation((chainKey: ChainKey): IAddressCodec => {
    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return solanaAddressCodecStub;
    }

    if (chainKey === ChainKey.TRON_MAINNET) {
      return tronAddressCodecStub;
    }

    return ethereumAddressCodecStub;
  });

  const userRef: TelegramUserRef = {
    telegramId: '42',
    username: 'tester',
  };

  usersRepositoryStub.findOrCreate.mockResolvedValue({
    id: 7,
    telegram_id: '42',
    username: 'tester',
    created_at: new Date('2026-02-01T00:00:00.000Z'),
  });
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
  userAlertPreferencesRepositoryStub.updateMute.mockResolvedValue({
    id: 1,
    user_id: 7,
    min_amount: 0,
    allow_transfer: true,
    allow_swap: true,
    muted_until: null,
    created_at: new Date('2026-02-01T00:00:00.000Z'),
    updated_at: new Date('2026-02-01T00:00:00.000Z'),
  });
  userAlertSettingsRepositoryStub.findOrCreateByUserAndChain.mockResolvedValue({
    id: 1,
    user_id: 7,
    chain_key: ChainKey.ETHEREUM_MAINNET,
    threshold_usd: 0,
    min_amount_usd: 0,
    cex_flow_mode: 'off',
    smart_filter_type: 'all',
    include_dexes: [],
    exclude_dexes: [],
    quiet_from: null,
    quiet_to: null,
    timezone: 'UTC',
    updated_at: new Date('2026-02-01T00:00:00.000Z'),
  });
  userAlertSettingsRepositoryStub.updateByUserAndChain.mockResolvedValue({
    id: 1,
    user_id: 7,
    chain_key: ChainKey.ETHEREUM_MAINNET,
    threshold_usd: 50000,
    min_amount_usd: 1000,
    cex_flow_mode: 'off',
    smart_filter_type: 'all',
    include_dexes: [],
    exclude_dexes: [],
    quiet_from: '23:00',
    quiet_to: '07:00',
    timezone: 'Europe/Moscow',
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
  alertMutesRepositoryStub.findActiveMute.mockResolvedValue(null);
  alertMutesRepositoryStub.upsertMute.mockResolvedValue({
    id: 1,
    user_id: 7,
    chain_key: ChainKey.ETHEREUM_MAINNET,
    wallet_id: 9,
    mute_until: new Date('2026-02-01T01:00:00.000Z'),
    source: 'alert_button',
    created_at: new Date('2026-02-01T00:00:00.000Z'),
  });

  const service: TrackingService = new TrackingService(
    usersRepositoryStub as unknown as UsersRepository,
    trackedWalletsRepositoryStub as unknown as TrackedWalletsRepository,
    subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
    addressCodecRegistryStub as unknown as IAddressCodecRegistry,
    historyExplorerAdapterStub as unknown as IHistoryExplorerAdapter,
    historyCacheServiceStub as unknown as HistoryCacheService,
    historyRateLimiterServiceStub as unknown as HistoryRateLimiterService,
    userAlertPreferencesRepositoryStub as unknown as UserAlertPreferencesRepository,
    userAlertSettingsRepositoryStub as unknown as UserAlertSettingsRepository,
    userWalletAlertPreferencesRepositoryStub as unknown as UserWalletAlertPreferencesRepository,
    alertMutesRepositoryStub as unknown as AlertMutesRepository,
    walletEventsRepositoryStub as unknown as WalletEventsRepository,
    appConfigServiceStub as unknown as AppConfigService,
  );

  return {
    userRef,
    usersRepositoryStub,
    trackedWalletsRepositoryStub,
    subscriptionsRepositoryStub,
    historyExplorerAdapterStub,
    addressCodecRegistryStub,
    historyCacheServiceStub,
    historyRateLimiterServiceStub,
    userAlertPreferencesRepositoryStub,
    userAlertSettingsRepositoryStub,
    userWalletAlertPreferencesRepositoryStub,
    alertMutesRepositoryStub,
    walletEventsRepositoryStub,
    appConfigServiceStub,
    service,
  };
};

describe('TrackingService', (): void => {
  it('tracks solana wallet with explicit chain key', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.trackedWalletsRepositoryStub.findOrCreate.mockResolvedValue({
      id: 21,
      chain_key: ChainKey.SOLANA_MAINNET,
      address: '11111111111111111111111111111111',
      label: 'system',
      created_at: new Date('2026-02-01T00:00:00.000Z'),
    });
    context.subscriptionsRepositoryStub.addSubscription.mockResolvedValue(true);

    const message: string = await context.service.trackAddress(
      context.userRef,
      '11111111111111111111111111111111',
      'system',
      ChainKey.SOLANA_MAINNET,
    );

    expect(context.trackedWalletsRepositoryStub.findOrCreate).toHaveBeenCalledWith(
      ChainKey.SOLANA_MAINNET,
      '11111111111111111111111111111111',
      'system',
    );
    expect(message).toContain('[solana_mainnet]');
  });

  it('tracks tron wallet with explicit chain key', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.trackedWalletsRepositoryStub.findOrCreate.mockResolvedValue({
      id: 22,
      chain_key: ChainKey.TRON_MAINNET,
      address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
      label: 'treasury',
      created_at: new Date('2026-02-01T00:00:00.000Z'),
    });
    context.subscriptionsRepositoryStub.addSubscription.mockResolvedValue(true);

    const message: string = await context.service.trackAddress(
      context.userRef,
      'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
      'treasury',
      ChainKey.TRON_MAINNET,
    );

    expect(context.trackedWalletsRepositoryStub.findOrCreate).toHaveBeenCalledWith(
      ChainKey.TRON_MAINNET,
      'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
      'treasury',
    );
    expect(message).toContain('[tron_mainnet]');
  });

  it('returns cached history without explorer call on fresh cache hit', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 3,
        chainKey: ChainKey.ETHEREUM_MAINNET,
        walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        walletLabel: 'vitalik',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.historyCacheServiceStub.getFresh.mockReturnValue({
      key: {
        address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        limit: 5,
        kind: HistoryKind.ALL,
        direction: HistoryDirectionFilter.ALL,
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
    expect(context.historyExplorerAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
  });

  it('fetches history and stores cache on miss', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.historyCacheServiceStub.getFresh.mockReturnValue(null);
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([]);
    context.historyExplorerAdapterStub.loadRecentTransactions.mockResolvedValue({
      items: [
        {
          txHash: '0xabc',
          from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          to: '0x0000000000000000000000000000000000000001',
          valueRaw: '1000000000000000000',
          isError: false,
          timestampSec: 1739160000,
          assetSymbol: 'ETH',
          assetDecimals: 18,
          eventType: HistoryItemType.TRANSFER,
          direction: HistoryDirection.OUT,
          txLink: 'https://etherscan.io/tx/0xabc',
        },
      ],
      nextOffset: null,
    });

    const message: string = await context.service.getAddressHistoryWithPolicy(
      context.userRef,
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      '5',
      HistoryRequestSource.COMMAND,
    );

    expect(context.historyExplorerAdapterStub.loadRecentTransactions).toHaveBeenCalledTimes(1);
    expect(context.historyCacheServiceStub.set).toHaveBeenCalledTimes(1);
    expect(message).toContain('<a href="https://etherscan.io/tx/0xabc">Tx #1</a>');
  });

  it('builds Solscan links for local Solana history entries', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.historyCacheServiceStub.getFresh.mockReturnValue(null);
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 16,
        chainKey: ChainKey.SOLANA_MAINNET,
        walletAddress: '11111111111111111111111111111111',
        walletLabel: 'system',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([
      {
        chainId: 101,
        chainKey: ChainKey.SOLANA_MAINNET,
        txHash: '5M9v4f2wVtQHSPvKzB9nAfD8x7M3s4cKz7w6x5Y4q3h2j1k',
        logIndex: 0,
        trackedAddress: '11111111111111111111111111111111',
        eventType: 'TRANSFER',
        direction: 'IN',
        contractAddress: null,
        tokenAddress: null,
        tokenSymbol: 'SOL',
        tokenDecimals: 9,
        tokenAmountRaw: '1000000000',
        valueFormatted: '1.0',
        dex: null,
        pair: null,
        occurredAt: new Date('2026-02-10T10:00:00.000Z'),
      },
    ]);

    const message: string = await context.service.getAddressHistoryWithPolicy(
      context.userRef,
      '#16',
      '5',
      HistoryRequestSource.COMMAND,
    );

    expect(context.historyExplorerAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
    expect(message).toContain(
      '<a href="https://solscan.io/tx/5M9v4f2wVtQHSPvKzB9nAfD8x7M3s4cKz7w6x5Y4q3h2j1k">Tx #1</a>',
    );
  });

  it('builds Tronscan links for local TRON history entries', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.historyCacheServiceStub.getFresh.mockReturnValue(null);
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 17,
        chainKey: ChainKey.TRON_MAINNET,
        walletAddress: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
        walletLabel: 'treasury',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([
      {
        chainId: 728126428,
        chainKey: ChainKey.TRON_MAINNET,
        txHash: '8c57a52f4d5aa91d20976c1b3ace6f1e62822fb4bae599c4bb1f11f6dc2d543c',
        logIndex: 0,
        trackedAddress: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
        eventType: 'TRANSFER',
        direction: 'IN',
        contractAddress: null,
        tokenAddress: null,
        tokenSymbol: 'TRX',
        tokenDecimals: 6,
        tokenAmountRaw: '1200000',
        valueFormatted: '1.2',
        dex: null,
        pair: null,
        occurredAt: new Date('2026-02-10T11:00:00.000Z'),
      },
    ]);

    const message: string = await context.service.getAddressHistoryWithPolicy(
      context.userRef,
      '#17',
      '5',
      HistoryRequestSource.COMMAND,
    );

    expect(context.historyExplorerAdapterStub.loadRecentTransactions).not.toHaveBeenCalled();
    expect(message).toContain(
      '<a href="https://tronscan.org/#/transaction/8c57a52f4d5aa91d20976c1b3ace6f1e62822fb4bae599c4bb1f11f6dc2d543c">Tx #1</a>',
    );
  });

  it('updates threshold usd value', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.setThresholdUsd(context.userRef, '50000');

    expect(context.userAlertSettingsRepositoryStub.updateByUserAndChain).toHaveBeenCalledWith(
      7,
      ChainKey.ETHEREUM_MAINNET,
      {
        thresholdUsd: 50000,
        minAmountUsd: 50000,
      },
    );
    expect(message).toContain('50000.00');
  });

  it('updates minimum usd filter as legacy alias for threshold', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.setMinAmountUsd(context.userRef, '1000');

    expect(context.userAlertSettingsRepositoryStub.updateByUserAndChain).toHaveBeenCalledWith(
      7,
      ChainKey.ETHEREUM_MAINNET,
      {
        thresholdUsd: 1000,
        minAmountUsd: 1000,
      },
    );
    expect(message).toContain('Порог USD обновлен');
    expect(message).toContain('legacy alias');
  });

  it('updates cex flow filter', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.setCexFlowFilter(context.userRef, 'out');

    expect(context.userAlertSettingsRepositoryStub.updateByUserAndChain).toHaveBeenCalledWith(
      7,
      ChainKey.ETHEREUM_MAINNET,
      {
        cexFlowMode: 'out',
      },
    );
    expect(message).toContain('CEX flow фильтр обновлен');
  });

  it('updates smart type filter', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.setSmartFilterType(context.userRef, 'buy');

    expect(context.userAlertSettingsRepositoryStub.updateByUserAndChain).toHaveBeenCalledWith(
      7,
      ChainKey.ETHEREUM_MAINNET,
      {
        smartFilterType: 'buy',
      },
    );
    expect(message).toContain('Smart type обновлен');
  });

  it('updates include dex filter list', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.setIncludeDexFilter(
      context.userRef,
      'uniswap,curve',
    );

    expect(context.userAlertSettingsRepositoryStub.updateByUserAndChain).toHaveBeenCalledWith(
      7,
      ChainKey.ETHEREUM_MAINNET,
      {
        includeDexes: ['uniswap', 'curve'],
      },
    );
    expect(message).toContain('Include DEX фильтр обновлен');
  });

  it('updates exclude dex filter list', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.setExcludeDexFilter(context.userRef, 'uniswap');

    expect(context.userAlertSettingsRepositoryStub.updateByUserAndChain).toHaveBeenCalledWith(
      7,
      ChainKey.ETHEREUM_MAINNET,
      {
        excludeDexes: ['uniswap'],
      },
    );
    expect(message).toContain('Exclude DEX фильтр обновлен');
  });

  it('updates quiet hours window', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.setQuietHours(context.userRef, '23:00-07:00');

    expect(context.userAlertSettingsRepositoryStub.updateByUserAndChain).toHaveBeenCalledWith(
      7,
      ChainKey.ETHEREUM_MAINNET,
      {
        quietFrom: '23:00',
        quietTo: '07:00',
      },
    );
    expect(message).toContain('23:00-07:00');
  });

  it('rejects invalid timezone format', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    await expect(
      context.service.setUserTimezone(context.userRef, 'invalid/timezone'),
    ).rejects.toThrow('Неизвестная таймзона');
  });

  it('adds wallet mute for 24h action callback', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 9,
        chainKey: ChainKey.ETHEREUM_MAINNET,
        walletAddress: '0x2F0b23f53734252Bda2277357e97e1517d6B042A',
        walletLabel: 'Maker_ETH_Vault',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const message: string = await context.service.muteWalletAlertsForDuration(
      context.userRef,
      '#9',
      1440,
      'alert_button',
    );

    expect(context.alertMutesRepositoryStub.upsertMute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        walletId: 9,
        source: 'alert_button',
      }),
    );
    expect(message).toContain('Кошелек #9');
  });

  it('returns wallet filters state with chain key', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 9,
        chainKey: ChainKey.ETHEREUM_MAINNET,
        walletAddress: '0x2F0b23f53734252Bda2277357e97e1517d6B042A',
        walletLabel: 'Maker_ETH_Vault',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);

    const state = await context.service.getWalletAlertFilterState(context.userRef, '#9');

    expect(state.chainKey).toBe(ChainKey.ETHEREUM_MAINNET);
    expect(state.walletId).toBe(9);
  });

  it('returns status with usd filters and quiet-hours', async (): Promise<void> => {
    const context: TestContext = createTestContext();

    const message: string = await context.service.getUserStatus(context.userRef);

    expect(message).toContain('threshold usd');
    expect(message).toContain('quiet:');
  });

  it('updates wallet filter and returns overridden state', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 9,
        chainKey: ChainKey.ETHEREUM_MAINNET,
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
  });
});
