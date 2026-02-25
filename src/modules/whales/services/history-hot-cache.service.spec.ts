import { describe, expect, it, vi } from 'vitest';

import { HistoryHotCacheService } from './history-hot-cache.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import type { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
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
};

type SubscriptionsRepositoryStub = {
  readonly listMostPopularTrackedWallets: ReturnType<typeof vi.fn>;
};

type HistoryExplorerAdapterStub = {
  readonly loadRecentTransactions: ReturnType<typeof vi.fn>;
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
    valueRaw: '1',
    isError: false,
    assetSymbol: 'SOL',
    assetDecimals: 9,
    eventType: HistoryItemType.TRANSFER,
    direction: HistoryDirection.IN,
    txLink: `https://solscan.io/tx/${input.txHash}`,
  };
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

    const service: HistoryHotCacheService = new HistoryHotCacheService(
      appConfigStub as unknown as AppConfigService,
      subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
      historyExplorerAdapterStub as unknown as IHistoryExplorerAdapter,
      null,
    );

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
    const service: HistoryHotCacheService = new HistoryHotCacheService(
      appConfigStub as unknown as AppConfigService,
      subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
      historyExplorerAdapterStub as unknown as IHistoryExplorerAdapter,
      null,
    );

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

    const service: HistoryHotCacheService = new HistoryHotCacheService(
      appConfigStub as unknown as AppConfigService,
      subscriptionsRepositoryStub as unknown as SubscriptionsRepository,
      historyExplorerAdapterStub as unknown as IHistoryExplorerAdapter,
      null,
    );

    await (service as unknown as { refreshTopWallets: () => Promise<unknown> }).refreshTopWallets();
    await (service as unknown as { refreshTopWallets: () => Promise<unknown> }).refreshTopWallets();

    expect(historyExplorerAdapterStub.loadRecentTransactions).toHaveBeenCalledTimes(1);
  });
});
