import { describe, expect, it, vi } from 'vitest';

import { HistoryHotCacheService } from './history-hot-cache.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import type { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import type { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import {
  HistoryDirection,
  HistoryItemType,
  type IHistoryItemDto,
} from '../entities/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../entities/history-request.dto';

type AppConfigStub = {
  readonly historyHotCacheEnabled: boolean;
  readonly historyHotCacheTopWallets: number;
  readonly historyHotCacheRefreshIntervalSec: number;
  readonly historyHotCachePageLimit: number;
  readonly historyHotCacheMaxItemsPerWallet: number;
  readonly historyHotCacheTtlSec: number;
  readonly historyHotCacheStaleSec: number;
  readonly etherscanTxBaseUrl: string;
  readonly tronscanTxBaseUrl: string;
};

type SubscriptionsRepositoryStub = {
  readonly listMostPopularTrackedWallets: ReturnType<typeof vi.fn>;
};

type HistoryExplorerAdapterStub = {
  readonly loadRecentTransactions: ReturnType<typeof vi.fn>;
};

type WalletEventsRepositoryStub = {
  readonly listRecentByTrackedAddress: ReturnType<typeof vi.fn>;
};

const buildItem = (input: {
  readonly txHash: string;
  readonly timestampSec: number;
}): IHistoryItemDto => {
  return {
    txHash: input.txHash,
    timestampSec: input.timestampSec,
    from: 'from-address',
    to: 'to-address',
    valueRaw: '1000000000',
    isError: false,
    assetSymbol: 'SOL',
    assetDecimals: 9,
    eventType: HistoryItemType.TRANSFER,
    direction: HistoryDirection.IN,
    txLink: `https://solscan.io/tx/${input.txHash}`,
  };
};

const createService = (args: {
  readonly appConfig: AppConfigStub;
  readonly subscriptionsRepository: SubscriptionsRepositoryStub;
  readonly walletEventsRepository: WalletEventsRepositoryStub;
  readonly historyExplorerAdapter: HistoryExplorerAdapterStub;
}): HistoryHotCacheService => {
  return new HistoryHotCacheService(
    args.appConfig as unknown as AppConfigService,
    args.subscriptionsRepository as unknown as SubscriptionsRepository,
    args.walletEventsRepository as unknown as WalletEventsRepository,
    args.historyExplorerAdapter as unknown as IHistoryExplorerAdapter,
  );
};

describe('HistoryHotCacheService', (): void => {
  it('loads top wallets and merges only new transactions', async (): Promise<void> => {
    const appConfigStub: AppConfigStub = {
      historyHotCacheEnabled: true,
      historyHotCacheTopWallets: 100,
      historyHotCacheRefreshIntervalSec: 999,
      historyHotCachePageLimit: 20,
      historyHotCacheMaxItemsPerWallet: 200,
      historyHotCacheTtlSec: 900,
      historyHotCacheStaleSec: 1800,
      etherscanTxBaseUrl: 'https://etherscan.io/tx/',
      tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
    };
    const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
      listMostPopularTrackedWallets: vi.fn(),
    };
    subscriptionsRepositoryStub.listMostPopularTrackedWallets.mockResolvedValue([
      {
        walletId: 7,
        chainKey: ChainKey.SOLANA_MAINNET,
        address: 'F58g8ZY578iaveya4q18Ye5FVFefdnjA3NCKcF2Wm',
        subscriberCount: 10,
      },
    ]);
    const historyExplorerAdapterStub: HistoryExplorerAdapterStub = {
      loadRecentTransactions: vi.fn(),
    };
    const walletEventsRepositoryStub: WalletEventsRepositoryStub = {
      listRecentByTrackedAddress: vi.fn().mockResolvedValue([]),
    };
    historyExplorerAdapterStub.loadRecentTransactions
      .mockResolvedValueOnce({
        items: [
          buildItem({ txHash: 'tx-1', timestampSec: 200 }),
          buildItem({ txHash: 'tx-2', timestampSec: 190 }),
        ],
        nextOffset: 20,
      })
      .mockResolvedValueOnce({
        items: [
          buildItem({ txHash: 'tx-2', timestampSec: 190 }),
          buildItem({ txHash: 'tx-3', timestampSec: 210 }),
        ],
        nextOffset: 20,
      });

    const service: HistoryHotCacheService = createService({
      appConfig: appConfigStub,
      subscriptionsRepository: subscriptionsRepositoryStub,
      walletEventsRepository: walletEventsRepositoryStub,
      historyExplorerAdapter: historyExplorerAdapterStub,
    });

    await (service as unknown as { refreshTopWallets: () => Promise<unknown> }).refreshTopWallets();
    await (service as unknown as { refreshTopWallets: () => Promise<unknown> }).refreshTopWallets();

    const page = service.getFreshPage({
      chainKey: ChainKey.SOLANA_MAINNET,
      address: 'F58g8ZY578iaveya4q18Ye5FVFefdnjA3NCKcF2Wm',
      limit: 20,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
    });

    expect(subscriptionsRepositoryStub.listMostPopularTrackedWallets).toHaveBeenCalledWith(100);
    expect(page).not.toBeNull();
    expect(page?.page.items.map((item: IHistoryItemDto): string => item.txHash)).toEqual([
      'tx-3',
      'tx-1',
      'tx-2',
    ]);
  });

  it('trims cached items to configured max size', async (): Promise<void> => {
    const appConfigStub: AppConfigStub = {
      historyHotCacheEnabled: true,
      historyHotCacheTopWallets: 100,
      historyHotCacheRefreshIntervalSec: 999,
      historyHotCachePageLimit: 20,
      historyHotCacheMaxItemsPerWallet: 2,
      historyHotCacheTtlSec: 900,
      historyHotCacheStaleSec: 1800,
      etherscanTxBaseUrl: 'https://etherscan.io/tx/',
      tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
    };
    const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
      listMostPopularTrackedWallets: vi.fn().mockResolvedValue([
        {
          walletId: 8,
          chainKey: ChainKey.SOLANA_MAINNET,
          address: 'F58g8ZY578iaveya4q18Ye5FVFefdnjA3NCKcF2Wm',
          subscriberCount: 9,
        },
      ]),
    };
    const historyExplorerAdapterStub: HistoryExplorerAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [
          buildItem({ txHash: 'tx-1', timestampSec: 10 }),
          buildItem({ txHash: 'tx-2', timestampSec: 20 }),
          buildItem({ txHash: 'tx-3', timestampSec: 30 }),
        ],
        nextOffset: 20,
      }),
    };
    const walletEventsRepositoryStub: WalletEventsRepositoryStub = {
      listRecentByTrackedAddress: vi.fn().mockResolvedValue([]),
    };
    const service: HistoryHotCacheService = createService({
      appConfig: appConfigStub,
      subscriptionsRepository: subscriptionsRepositoryStub,
      walletEventsRepository: walletEventsRepositoryStub,
      historyExplorerAdapter: historyExplorerAdapterStub,
    });

    await (service as unknown as { refreshTopWallets: () => Promise<unknown> }).refreshTopWallets();

    const page = service.getFreshPage({
      chainKey: ChainKey.SOLANA_MAINNET,
      address: 'F58g8ZY578iaveya4q18Ye5FVFefdnjA3NCKcF2Wm',
      limit: 20,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
    });

    expect(page).not.toBeNull();
    expect(page?.page.items.map((item: IHistoryItemDto): string => item.txHash)).toEqual([
      'tx-3',
      'tx-2',
    ]);
  });

  it('skips refresh on chain cooldown after 429 failure', async (): Promise<void> => {
    const appConfigStub: AppConfigStub = {
      historyHotCacheEnabled: true,
      historyHotCacheTopWallets: 100,
      historyHotCacheRefreshIntervalSec: 999,
      historyHotCachePageLimit: 20,
      historyHotCacheMaxItemsPerWallet: 200,
      historyHotCacheTtlSec: 900,
      historyHotCacheStaleSec: 1800,
      etherscanTxBaseUrl: 'https://etherscan.io/tx/',
      tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
    };
    const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
      listMostPopularTrackedWallets: vi.fn().mockResolvedValue([
        {
          walletId: 1,
          chainKey: ChainKey.TRON_MAINNET,
          address: 'TEDVku9LrQDLdbg1ik6HrRtK6Uimg8epSV',
          subscriberCount: 10,
        },
      ]),
    };
    const historyExplorerAdapterStub: HistoryExplorerAdapterStub = {
      loadRecentTransactions: vi.fn().mockRejectedValue(new Error('TRON history HTTP 429')),
    };
    const walletEventsRepositoryStub: WalletEventsRepositoryStub = {
      listRecentByTrackedAddress: vi.fn().mockResolvedValue([]),
    };

    const service: HistoryHotCacheService = createService({
      appConfig: appConfigStub,
      subscriptionsRepository: subscriptionsRepositoryStub,
      walletEventsRepository: walletEventsRepositoryStub,
      historyExplorerAdapter: historyExplorerAdapterStub,
    });

    await (service as unknown as { refreshTopWallets: () => Promise<unknown> }).refreshTopWallets();
    await (service as unknown as { refreshTopWallets: () => Promise<unknown> }).refreshTopWallets();

    expect(historyExplorerAdapterStub.loadRecentTransactions).toHaveBeenCalledTimes(1);
  });

  it('seeds cache from local wallet_events history before explorer updates', async (): Promise<void> => {
    const appConfigStub: AppConfigStub = {
      historyHotCacheEnabled: true,
      historyHotCacheTopWallets: 100,
      historyHotCacheRefreshIntervalSec: 999,
      historyHotCachePageLimit: 20,
      historyHotCacheMaxItemsPerWallet: 200,
      historyHotCacheTtlSec: 900,
      historyHotCacheStaleSec: 1800,
      etherscanTxBaseUrl: 'https://etherscan.io/tx/',
      tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
    };
    const subscriptionsRepositoryStub: SubscriptionsRepositoryStub = {
      listMostPopularTrackedWallets: vi.fn().mockResolvedValue([
        {
          walletId: 1,
          chainKey: ChainKey.ETHEREUM_MAINNET,
          address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          subscriberCount: 5,
        },
      ]),
    };
    const walletEventsRepositoryStub: WalletEventsRepositoryStub = {
      listRecentByTrackedAddress: vi.fn().mockResolvedValue([
        {
          chainId: 1,
          chainKey: ChainKey.ETHEREUM_MAINNET,
          txHash: 'persisted-1',
          logIndex: 0,
          trackedAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          eventType: 'TRANSFER',
          direction: 'IN',
          assetStandard: 'NATIVE',
          contractAddress: null,
          tokenAddress: null,
          tokenSymbol: 'ETH',
          tokenDecimals: 18,
          tokenAmountRaw: '1000000000000000',
          valueFormatted: '0.001',
          counterpartyAddress: '0x000000000000000000000000000000000000dead',
          dex: null,
          pair: null,
          usdPrice: null,
          usdAmount: null,
          usdUnavailable: true,
          swapFromSymbol: null,
          swapFromAmountText: null,
          swapToSymbol: null,
          swapToAmountText: null,
          occurredAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      ]),
    };
    const historyExplorerAdapterStub: HistoryExplorerAdapterStub = {
      loadRecentTransactions: vi.fn().mockResolvedValue({
        items: [],
        nextOffset: null,
      }),
    };

    const service: HistoryHotCacheService = createService({
      appConfig: appConfigStub,
      subscriptionsRepository: subscriptionsRepositoryStub,
      walletEventsRepository: walletEventsRepositoryStub,
      historyExplorerAdapter: historyExplorerAdapterStub,
    });

    await (service as unknown as { refreshTopWallets: () => Promise<unknown> }).refreshTopWallets();

    const page = service.getFreshPage({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      limit: 20,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
    });

    expect(page).not.toBeNull();
    expect(page?.page.items.map((item: IHistoryItemDto): string => item.txHash)).toEqual([
      'persisted-1',
    ]);
  });
});
