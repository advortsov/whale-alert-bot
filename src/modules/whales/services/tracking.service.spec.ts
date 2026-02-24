import { describe, expect, it, vi } from 'vitest';

import type { HistoryCacheService } from './history-cache.service';
import type { HistoryHotCacheService } from './history-hot-cache.service';
import type { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingAddressService } from './tracking-address.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingHistoryPageBuilderService } from './tracking-history-page-builder.service';
import { TrackingHistoryPageService } from './tracking-history-page.service';
import { TrackingHistoryQueryParserService } from './tracking-history-query-parser.service';
import { TrackingHistoryService } from './tracking-history.service';
import { TrackingHistoryServiceDependencies } from './tracking-history.service.dependencies';
import { TrackingSettingsParserService } from './tracking-settings-parser.service';
import {
  TrackingSettingsService,
  TrackingSettingsServiceDependencies,
} from './tracking-settings.service';
import { TrackingWalletsServiceDependencies } from './tracking-wallets.dependencies';
import { TrackingWalletsService } from './tracking-wallets.service';
import { TrackingService } from './tracking.service';
import type { IAddressCodecRegistry } from '../../../common/interfaces/address/address-codec-registry.interfaces';
import type { IAddressCodec } from '../../../common/interfaces/address/address-codec.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import type { AlertMutesRepository } from '../../../database/repositories/alert-mutes.repository';
import type { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import type { TrackedWalletsRepository } from '../../../database/repositories/tracked-wallets.repository';
import type { UserAlertPreferencesRepository } from '../../../database/repositories/user-alert-preferences.repository';
import type { UserAlertSettingsRepository } from '../../../database/repositories/user-alert-settings.repository';
import type { UserWalletAlertPreferencesRepository } from '../../../database/repositories/user-wallet-alert-preferences.repository';
import type { UsersRepository } from '../../../database/repositories/users.repository';
import type { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import { HistoryDirection, HistoryItemType } from '../entities/history-item.dto';
import {
  HistoryRateLimitReason,
  HistoryRequestSource,
  type HistoryRateLimitDecision,
} from '../entities/history-rate-limiter.interfaces';
import { HistoryDirectionFilter, HistoryKind } from '../entities/history-request.dto';
import { AlertFilterToggleTarget, type TelegramUserRef } from '../entities/tracking.interfaces';

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

type HistoryHotCacheServiceStub = {
  readonly getFreshPage: ReturnType<typeof vi.fn>;
  readonly getStalePage: ReturnType<typeof vi.fn>;
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
  readonly deleteMute: ReturnType<typeof vi.fn>;
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
  readonly historyHotCacheServiceStub: HistoryHotCacheServiceStub;
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
  historyCacheServiceStub.getFresh.mockReturnValue(null);
  historyCacheServiceStub.getStale.mockReturnValue(null);
  const historyRateLimiterServiceStub: HistoryRateLimiterServiceStub = {
    evaluate: vi.fn(),
    getSnapshot: vi.fn(),
  };
  const historyHotCacheServiceStub: HistoryHotCacheServiceStub = {
    getFreshPage: vi.fn(),
    getStalePage: vi.fn(),
  };
  historyHotCacheServiceStub.getFreshPage.mockReturnValue(null);
  historyHotCacheServiceStub.getStalePage.mockReturnValue(null);
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
    deleteMute: vi.fn(),
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
  alertMutesRepositoryStub.deleteMute.mockResolvedValue(true);
  alertMutesRepositoryStub.upsertMute.mockResolvedValue({
    id: 1,
    user_id: 7,
    chain_key: ChainKey.ETHEREUM_MAINNET,
    wallet_id: 9,
    mute_until: new Date('2026-02-01T01:00:00.000Z'),
    source: 'alert_button',
    created_at: new Date('2026-02-01T00:00:00.000Z'),
  });

  const trackingAddressService: TrackingAddressService = new TrackingAddressService(
    subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
    addressCodecRegistryStub as unknown as IAddressCodecRegistry,
  );
  const settingsParserService: TrackingSettingsParserService = new TrackingSettingsParserService();
  const historyFormatter: TrackingHistoryFormatterService = new TrackingHistoryFormatterService(
    appConfigServiceStub as unknown as AppConfigService,
  );
  const historyQueryParserService: TrackingHistoryQueryParserService =
    new TrackingHistoryQueryParserService();
  const trackingHistoryPageService: TrackingHistoryPageService = new TrackingHistoryPageService(
    walletEventsRepositoryStub as unknown as WalletEventsRepository,
    historyFormatter,
  );

  const walletsDeps = new TrackingWalletsServiceDependencies();
  (walletsDeps as { usersRepository: UsersRepository }).usersRepository =
    usersRepositoryStub as unknown as UsersRepository;
  (walletsDeps as { trackedWalletsRepository: TrackedWalletsRepository }).trackedWalletsRepository =
    trackedWalletsRepositoryStub as unknown as TrackedWalletsRepository;
  (walletsDeps as { subscriptionsRepository: SubscriptionsRepository }).subscriptionsRepository =
    subscriptionsRepositoryStub as unknown as SubscriptionsRepository;
  (walletsDeps as { addressCodecRegistry: IAddressCodecRegistry }).addressCodecRegistry =
    addressCodecRegistryStub as unknown as IAddressCodecRegistry;
  (walletsDeps as { trackingAddressService: TrackingAddressService }).trackingAddressService =
    trackingAddressService;
  (
    walletsDeps as { userAlertPreferencesRepository: UserAlertPreferencesRepository }
  ).userAlertPreferencesRepository =
    userAlertPreferencesRepositoryStub as unknown as UserAlertPreferencesRepository;
  (
    walletsDeps as { userAlertSettingsRepository: UserAlertSettingsRepository }
  ).userAlertSettingsRepository =
    userAlertSettingsRepositoryStub as unknown as UserAlertSettingsRepository;
  (
    walletsDeps as { userWalletAlertPreferencesRepository: UserWalletAlertPreferencesRepository }
  ).userWalletAlertPreferencesRepository =
    userWalletAlertPreferencesRepositoryStub as unknown as UserWalletAlertPreferencesRepository;
  (walletsDeps as { alertMutesRepository: AlertMutesRepository }).alertMutesRepository =
    alertMutesRepositoryStub as unknown as AlertMutesRepository;
  (walletsDeps as { walletEventsRepository: WalletEventsRepository }).walletEventsRepository =
    walletEventsRepositoryStub as unknown as WalletEventsRepository;
  (walletsDeps as { settingsParserService: TrackingSettingsParserService }).settingsParserService =
    settingsParserService;
  (walletsDeps as { historyFormatter: TrackingHistoryFormatterService }).historyFormatter =
    historyFormatter;
  const walletsService: TrackingWalletsService = new TrackingWalletsService(walletsDeps);

  const settingsDeps = new TrackingSettingsServiceDependencies();
  (settingsDeps as { usersRepository: UsersRepository }).usersRepository =
    usersRepositoryStub as unknown as UsersRepository;
  (
    settingsDeps as { userAlertPreferencesRepository: UserAlertPreferencesRepository }
  ).userAlertPreferencesRepository =
    userAlertPreferencesRepositoryStub as unknown as UserAlertPreferencesRepository;
  (
    settingsDeps as { userAlertSettingsRepository: UserAlertSettingsRepository }
  ).userAlertSettingsRepository =
    userAlertSettingsRepositoryStub as unknown as UserAlertSettingsRepository;
  (
    settingsDeps as { historyRateLimiterService: HistoryRateLimiterService }
  ).historyRateLimiterService =
    historyRateLimiterServiceStub as unknown as HistoryRateLimiterService;
  (settingsDeps as { settingsParserService: TrackingSettingsParserService }).settingsParserService =
    settingsParserService;
  const settingsService: TrackingSettingsService = new TrackingSettingsService(settingsDeps);

  const historyDeps = new TrackingHistoryServiceDependencies();
  (historyDeps as { usersRepository: UsersRepository }).usersRepository =
    usersRepositoryStub as unknown as UsersRepository;
  (historyDeps as { trackingAddressService: TrackingAddressService }).trackingAddressService =
    trackingAddressService;
  (historyDeps as { historyExplorerAdapter: IHistoryExplorerAdapter }).historyExplorerAdapter =
    historyExplorerAdapterStub as unknown as IHistoryExplorerAdapter;
  (historyDeps as { historyCacheService: HistoryCacheService }).historyCacheService =
    historyCacheServiceStub as unknown as HistoryCacheService;
  (
    historyDeps as { historyRateLimiterService: HistoryRateLimiterService }
  ).historyRateLimiterService =
    historyRateLimiterServiceStub as unknown as HistoryRateLimiterService;
  (historyDeps as { historyHotCacheService: HistoryHotCacheService }).historyHotCacheService =
    historyHotCacheServiceStub as unknown as HistoryHotCacheService;
  (
    historyDeps as { trackingHistoryPageService: TrackingHistoryPageService }
  ).trackingHistoryPageService = trackingHistoryPageService;
  const historyPageBuilderService: TrackingHistoryPageBuilderService =
    new TrackingHistoryPageBuilderService(
      historyExplorerAdapterStub as unknown as IHistoryExplorerAdapter,
      trackingHistoryPageService,
      historyFormatter,
    );
  (
    historyDeps as { historyPageBuilderService: TrackingHistoryPageBuilderService }
  ).historyPageBuilderService = historyPageBuilderService;
  (historyDeps as { historyFormatter: TrackingHistoryFormatterService }).historyFormatter =
    historyFormatter;
  (
    historyDeps as { historyQueryParserService: TrackingHistoryQueryParserService }
  ).historyQueryParserService = historyQueryParserService;
  const historyService: TrackingHistoryService = new TrackingHistoryService(historyDeps);

  const service: TrackingService = new TrackingService(
    walletsService,
    settingsService,
    historyService,
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
    historyHotCacheServiceStub,
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

    const message: string = await context.service.getAddressHistoryWithPolicy(context.userRef, {
      rawAddress: '#3',
      rawLimit: '5',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

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

    const message: string = await context.service.getAddressHistoryWithPolicy(context.userRef, {
      rawAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      rawLimit: '5',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

    expect(context.historyExplorerAdapterStub.loadRecentTransactions).toHaveBeenCalledTimes(1);
    expect(context.historyCacheServiceStub.set).toHaveBeenCalledTimes(1);
    expect(message).toContain('<a href="https://etherscan.io/tx/0xabc">Tx #1</a>');
  });

  it('returns structured history page items from local wallet events', async (): Promise<void> => {
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
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([
      {
        chainId: 1,
        chainKey: ChainKey.ETHEREUM_MAINNET,
        txHash: '0xlocal1',
        logIndex: 0,
        trackedAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        eventType: 'TRANSFER',
        direction: 'OUT',
        assetStandard: 'ERC20',
        contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        tokenSymbol: 'USDT',
        tokenDecimals: 6,
        tokenAmountRaw: '99000000',
        valueFormatted: '99.000000',
        dex: null,
        pair: null,
        occurredAt: new Date('2026-02-23T00:00:00.000Z'),
      },
    ]);

    const page = await context.service.getAddressHistoryPageWithPolicy(context.userRef, {
      rawAddress: '#3',
      rawLimit: '10',
      rawOffset: '0',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      txHash: '0xlocal1',
      amountText: '99.000000 USDT',
      chainKey: ChainKey.ETHEREUM_MAINNET,
    });
    expect(page.nextOffset).toBeNull();
  });

  it('returns structured history page items from explorer fallback when local is empty', async (): Promise<void> => {
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
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([]);
    context.historyExplorerAdapterStub.loadRecentTransactions.mockResolvedValue({
      items: [
        {
          txHash: '0xfallback1',
          from: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          to: '0x0000000000000000000000000000000000000001',
          valueRaw: '1000000000000000000',
          isError: false,
          timestampSec: 1739160000,
          assetSymbol: 'ETH',
          assetDecimals: 18,
          eventType: HistoryItemType.TRANSFER,
          direction: HistoryDirection.OUT,
          txLink: 'https://etherscan.io/tx/0xfallback1',
        },
      ],
      nextOffset: 10,
    });

    const page = await context.service.getAddressHistoryPageWithPolicy(context.userRef, {
      rawAddress: '#3',
      rawLimit: '10',
      rawOffset: '0',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      txHash: '0xfallback1',
      amountText: '1.000000 ETH',
      chainKey: ChainKey.ETHEREUM_MAINNET,
    });
    expect(page.nextOffset).toBe(10);
  });

  it('returns explorer fallback page for offset request when local offset page is empty', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 6,
        chainKey: ChainKey.TRON_MAINNET,
        walletAddress: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
        walletLabel: 'tron-main',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([]);
    context.historyExplorerAdapterStub.loadRecentTransactions.mockResolvedValue({
      items: [
        {
          txHash: '0xoffsetfallback',
          from: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
          to: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          valueRaw: '1000000',
          isError: false,
          timestampSec: 1739160000,
          assetSymbol: 'TRX',
          assetDecimals: 6,
          eventType: HistoryItemType.TRANSFER,
          direction: HistoryDirection.OUT,
          txLink: 'https://tronscan.org/#/transaction/0xoffsetfallback',
        },
      ],
      nextOffset: 20,
    });

    const page = await context.service.getAddressHistoryPageWithPolicy(context.userRef, {
      rawAddress: '#6',
      rawLimit: '10',
      rawOffset: '10',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

    expect(context.historyExplorerAdapterStub.loadRecentTransactions).toHaveBeenCalledWith({
      chainKey: ChainKey.TRON_MAINNET,
      address: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
      limit: 10,
      offset: 10,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
      minAmountUsd: null,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      txHash: '0xoffsetfallback',
      chainKey: ChainKey.TRON_MAINNET,
    });
    expect(page.nextOffset).toBe(20);
  });

  it('uses explorer page for first Solana history page when local history is short', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 22,
        chainKey: ChainKey.SOLANA_MAINNET,
        walletAddress: '11111111111111111111111111111111',
        walletLabel: 'sol-main',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([
      {
        chainId: 101,
        chainKey: ChainKey.SOLANA_MAINNET,
        txHash: 'local-sol-tx-1',
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
        occurredAt: new Date('2026-02-23T00:00:00.000Z'),
      },
    ]);
    context.historyExplorerAdapterStub.loadRecentTransactions.mockResolvedValue({
      items: [
        {
          txHash: 'explorer-sol-tx-1',
          from: '11111111111111111111111111111111',
          to: '22222222222222222222222222222222',
          valueRaw: '2000000000',
          isError: false,
          timestampSec: 1739160000,
          assetSymbol: 'SOL',
          assetDecimals: 9,
          eventType: HistoryItemType.TRANSFER,
          direction: HistoryDirection.OUT,
          txLink: 'https://solscan.io/tx/explorer-sol-tx-1',
        },
      ],
      nextOffset: 10,
    });

    const page = await context.service.getAddressHistoryPageWithPolicy(context.userRef, {
      rawAddress: '#22',
      rawLimit: '10',
      rawOffset: '0',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

    expect(context.historyExplorerAdapterStub.loadRecentTransactions).toHaveBeenCalledTimes(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.txHash).toBe('explorer-sol-tx-1');
    expect(page.nextOffset).toBe(10);
  });

  it('uses explorer page for Solana offset history when available', async (): Promise<void> => {
    const context: TestContext = createTestContext();
    context.subscriptionsRepositoryStub.listByUserId.mockResolvedValue([
      {
        subscriptionId: 1,
        walletId: 23,
        chainKey: ChainKey.SOLANA_MAINNET,
        walletAddress: '33333333333333333333333333333333',
        walletLabel: 'sol-offset',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    ]);
    context.walletEventsRepositoryStub.listRecentByTrackedAddress.mockResolvedValue([
      {
        chainId: 101,
        chainKey: ChainKey.SOLANA_MAINNET,
        txHash: 'local-sol-offset',
        logIndex: 0,
        trackedAddress: '33333333333333333333333333333333',
        eventType: 'TRANSFER',
        direction: 'OUT',
        contractAddress: null,
        tokenAddress: null,
        tokenSymbol: 'SOL',
        tokenDecimals: 9,
        tokenAmountRaw: '500000000',
        valueFormatted: '0.5',
        dex: null,
        pair: null,
        occurredAt: new Date('2026-02-22T00:00:00.000Z'),
      },
    ]);
    context.historyExplorerAdapterStub.loadRecentTransactions.mockResolvedValue({
      items: [
        {
          txHash: 'explorer-sol-offset-1',
          from: '33333333333333333333333333333333',
          to: '44444444444444444444444444444444',
          valueRaw: '4000000000',
          isError: false,
          timestampSec: 1739160010,
          assetSymbol: 'SOL',
          assetDecimals: 9,
          eventType: HistoryItemType.TRANSFER,
          direction: HistoryDirection.OUT,
          txLink: 'https://solscan.io/tx/explorer-sol-offset-1',
        },
      ],
      nextOffset: 30,
    });

    const page = await context.service.getAddressHistoryPageWithPolicy(context.userRef, {
      rawAddress: '#23',
      rawLimit: '10',
      rawOffset: '20',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.txHash).toBe('explorer-sol-offset-1');
    expect(page.nextOffset).toBe(30);
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

    const message: string = await context.service.getAddressHistoryWithPolicy(context.userRef, {
      rawAddress: '#16',
      rawLimit: '5',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

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

    const message: string = await context.service.getAddressHistoryWithPolicy(context.userRef, {
      rawAddress: '#17',
      rawLimit: '5',
      source: HistoryRequestSource.COMMAND,
      rawKind: null,
      rawDirection: null,
    });

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

  it('removes wallet mute and returns null mutedUntil', async (): Promise<void> => {
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

    const result = await context.service.unmuteWallet(context.userRef, '#9');

    expect(context.alertMutesRepositoryStub.deleteMute).toHaveBeenCalledWith({
      userId: 7,
      chainKey: ChainKey.ETHEREUM_MAINNET,
      walletId: 9,
    });
    expect(result).toEqual({
      walletId: 9,
      mutedUntil: null,
    });
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
