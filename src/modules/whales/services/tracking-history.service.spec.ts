import { describe, expect, it, vi } from 'vitest';

import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingHistoryQueryParserService } from './tracking-history-query-parser.service';
import { TrackingHistoryService } from './tracking-history.service';
import { TrackingHistoryServiceDependencies } from './tracking-history.service.dependencies';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { AppConfigService } from '../../../config/app-config.service';
import { HistoryHotCacheSource } from '../entities/history-hot-cache.interfaces';
import {
  HistoryDirection,
  HistoryItemType,
  type IHistoryItemDto,
} from '../entities/history-item.dto';
import {
  HistoryRateLimitReason,
  HistoryRequestSource,
  type HistoryRateLimitDecision,
} from '../entities/history-rate-limiter.interfaces';
import { HistoryDirectionFilter, HistoryKind } from '../entities/history-request.dto';

type AppConfigStub = {
  readonly etherscanTxBaseUrl: string;
  readonly tronscanTxBaseUrl: string;
};

const allowDecision: HistoryRateLimitDecision = {
  allowed: true,
  reason: HistoryRateLimitReason.OK,
  retryAfterSec: null,
};

const buildHistoryItem = (txHash: string): IHistoryItemDto => {
  return {
    txHash,
    timestampSec: 1_770_000_000,
    from: 'from-address',
    to: 'to-address',
    valueRaw: '1000000',
    isError: false,
    assetSymbol: 'TRX',
    assetDecimals: 6,
    eventType: HistoryItemType.TRANSFER,
    direction: HistoryDirection.IN,
    txLink: `https://tronscan.org/#/transaction/${txHash}`,
  };
};

describe('TrackingHistoryService', (): void => {
  it('uses hot cache as source before explorer when local events are absent', async (): Promise<void> => {
    const deps: TrackingHistoryServiceDependencies = new TrackingHistoryServiceDependencies();
    const historyFormatter: TrackingHistoryFormatterService = new TrackingHistoryFormatterService({
      etherscanTxBaseUrl: 'https://etherscan.io/tx/',
      tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
    } as AppConfigStub as unknown as AppConfigService);
    const historyQueryParserService: TrackingHistoryQueryParserService =
      new TrackingHistoryQueryParserService();

    (
      deps as unknown as { usersRepository: { findOrCreate: ReturnType<typeof vi.fn> } }
    ).usersRepository = {
      findOrCreate: vi.fn().mockResolvedValue({ id: 11 }),
    };
    (
      deps as unknown as {
        trackingAddressService: {
          resolveHistoryTarget: ReturnType<typeof vi.fn>;
          assertHistoryChainIsSupported: ReturnType<typeof vi.fn>;
        };
      }
    ).trackingAddressService = {
      resolveHistoryTarget: vi.fn().mockResolvedValue({
        address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
        walletId: 7,
        chainKey: ChainKey.TRON_MAINNET,
      }),
      assertHistoryChainIsSupported: vi.fn(),
    };
    (
      deps as unknown as {
        historyExplorerAdapter: { loadRecentTransactions: ReturnType<typeof vi.fn> };
      }
    ).historyExplorerAdapter = {
      loadRecentTransactions: vi.fn(),
    };
    (
      deps as unknown as {
        historyCacheService: {
          getFresh: ReturnType<typeof vi.fn>;
          getStale: ReturnType<typeof vi.fn>;
          set: ReturnType<typeof vi.fn>;
        };
      }
    ).historyCacheService = {
      getFresh: vi.fn().mockReturnValue(null),
      getStale: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    };
    (
      deps as unknown as { historyRateLimiterService: { evaluate: ReturnType<typeof vi.fn> } }
    ).historyRateLimiterService = {
      evaluate: vi.fn().mockReturnValue(allowDecision),
    };
    (
      deps as unknown as {
        trackingHistoryPageService: {
          loadLocalHistoryPage: ReturnType<typeof vi.fn>;
          mapExplorerItemsToListItems: ReturnType<typeof vi.fn>;
        };
      }
    ).trackingHistoryPageService = {
      loadLocalHistoryPage: vi.fn().mockResolvedValue({
        pageEvents: [],
        hasNextPage: false,
        nextOffset: null,
      }),
      mapExplorerItemsToListItems: vi
        .fn()
        .mockImplementation((items: readonly IHistoryItemDto[], chainKey: ChainKey) =>
          items.map((item: IHistoryItemDto) => ({
            txHash: item.txHash,
            occurredAt: new Date(item.timestampSec * 1000).toISOString(),
            eventType: item.eventType,
            direction: item.direction,
            amountText: '1 TRX',
            txUrl: item.txLink ?? '',
            assetSymbol: item.assetSymbol,
            chainKey,
            txType: 'TRANSFER',
            flowType: 'UNKNOWN',
            flowLabel: 'UNKNOWN',
            assetStandard: 'NATIVE',
            dex: null,
            pair: null,
            isError: item.isError,
            counterpartyAddress: null,
            contractAddress: null,
          })),
        ),
    };
    (
      deps as unknown as {
        historyPageBuilderService: {
          buildOffsetHistoryPageFromExplorer: ReturnType<typeof vi.fn>;
          buildOffsetHistoryPage: ReturnType<typeof vi.fn>;
        };
      }
    ).historyPageBuilderService = {
      buildOffsetHistoryPageFromExplorer: vi.fn(),
      buildOffsetHistoryPage: vi.fn(),
    };
    (deps as unknown as { historyFormatter: TrackingHistoryFormatterService }).historyFormatter =
      historyFormatter;
    (
      deps as unknown as { historyQueryParserService: TrackingHistoryQueryParserService }
    ).historyQueryParserService = historyQueryParserService;
    (
      deps as unknown as {
        historyHotCacheService: {
          getFreshPage: ReturnType<typeof vi.fn>;
          getStalePage: ReturnType<typeof vi.fn>;
        };
      }
    ).historyHotCacheService = {
      getFreshPage: vi.fn().mockReturnValue({
        source: HistoryHotCacheSource.FRESH,
        page: {
          items: [buildHistoryItem('tron-hot-1')],
          nextOffset: null,
        },
      }),
      getStalePage: vi.fn().mockReturnValue(null),
    };

    const service: TrackingHistoryService = new TrackingHistoryService(deps);

    const message: string = await service.getAddressHistoryWithPolicy(
      {
        telegramId: '123',
        username: 'user',
      },
      {
        rawAddress: '#7',
        rawLimit: '20',
        source: HistoryRequestSource.COMMAND,
        rawKind: HistoryKind.ALL,
        rawDirection: HistoryDirectionFilter.ALL,
      },
    );

    expect(message).toContain('tron-hot-1');
    expect(
      (
        deps as unknown as {
          historyExplorerAdapter: { loadRecentTransactions: ReturnType<typeof vi.fn> };
        }
      ).historyExplorerAdapter.loadRecentTransactions,
    ).not.toHaveBeenCalled();
  });

  it('serves stale hot cache when explorer is rate-limited', async (): Promise<void> => {
    const deps: TrackingHistoryServiceDependencies = new TrackingHistoryServiceDependencies();
    const historyFormatter: TrackingHistoryFormatterService = new TrackingHistoryFormatterService({
      etherscanTxBaseUrl: 'https://etherscan.io/tx/',
      tronscanTxBaseUrl: 'https://tronscan.org/#/transaction/',
    } as AppConfigStub as unknown as AppConfigService);
    const historyQueryParserService: TrackingHistoryQueryParserService =
      new TrackingHistoryQueryParserService();

    (
      deps as unknown as { usersRepository: { findOrCreate: ReturnType<typeof vi.fn> } }
    ).usersRepository = {
      findOrCreate: vi.fn().mockResolvedValue({ id: 13 }),
    };
    (
      deps as unknown as {
        trackingAddressService: {
          resolveHistoryTarget: ReturnType<typeof vi.fn>;
          assertHistoryChainIsSupported: ReturnType<typeof vi.fn>;
        };
      }
    ).trackingAddressService = {
      resolveHistoryTarget: vi.fn().mockResolvedValue({
        address: 'F58g8ZY578iaveya4q18Ye5FVFefdnjA3NCKcF2Wm',
        walletId: 9,
        chainKey: ChainKey.SOLANA_MAINNET,
      }),
      assertHistoryChainIsSupported: vi.fn(),
    };
    (
      deps as unknown as {
        historyExplorerAdapter: { loadRecentTransactions: ReturnType<typeof vi.fn> };
      }
    ).historyExplorerAdapter = {
      loadRecentTransactions: vi.fn().mockRejectedValue(new Error('Solana RPC HTTP 429')),
    };
    (
      deps as unknown as {
        historyCacheService: {
          getFresh: ReturnType<typeof vi.fn>;
          getStale: ReturnType<typeof vi.fn>;
          set: ReturnType<typeof vi.fn>;
        };
      }
    ).historyCacheService = {
      getFresh: vi.fn().mockReturnValue(null),
      getStale: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    };
    (
      deps as unknown as { historyRateLimiterService: { evaluate: ReturnType<typeof vi.fn> } }
    ).historyRateLimiterService = {
      evaluate: vi.fn().mockReturnValue(allowDecision),
    };
    (
      deps as unknown as {
        trackingHistoryPageService: {
          loadLocalHistoryPage: ReturnType<typeof vi.fn>;
          mapExplorerItemsToListItems: ReturnType<typeof vi.fn>;
        };
      }
    ).trackingHistoryPageService = {
      loadLocalHistoryPage: vi.fn().mockResolvedValue({
        pageEvents: [],
        hasNextPage: false,
        nextOffset: null,
      }),
      mapExplorerItemsToListItems: vi
        .fn()
        .mockImplementation((items: readonly IHistoryItemDto[], chainKey: ChainKey) =>
          items.map((item: IHistoryItemDto) => ({
            txHash: item.txHash,
            occurredAt: new Date(item.timestampSec * 1000).toISOString(),
            eventType: item.eventType,
            direction: item.direction,
            amountText: '1 SOL',
            txUrl: item.txLink ?? '',
            assetSymbol: item.assetSymbol,
            chainKey,
            txType: 'TRANSFER',
            flowType: 'UNKNOWN',
            flowLabel: 'UNKNOWN',
            assetStandard: 'NATIVE',
            dex: null,
            pair: null,
            isError: item.isError,
            counterpartyAddress: null,
            contractAddress: null,
          })),
        ),
    };
    (
      deps as unknown as {
        historyPageBuilderService: {
          buildOffsetHistoryPageFromExplorer: ReturnType<typeof vi.fn>;
          buildOffsetHistoryPage: ReturnType<typeof vi.fn>;
        };
      }
    ).historyPageBuilderService = {
      buildOffsetHistoryPageFromExplorer: vi.fn(),
      buildOffsetHistoryPage: vi.fn(),
    };
    (deps as unknown as { historyFormatter: TrackingHistoryFormatterService }).historyFormatter =
      historyFormatter;
    (
      deps as unknown as { historyQueryParserService: TrackingHistoryQueryParserService }
    ).historyQueryParserService = historyQueryParserService;
    (
      deps as unknown as {
        historyHotCacheService: {
          getFreshPage: ReturnType<typeof vi.fn>;
          getStalePage: ReturnType<typeof vi.fn>;
        };
      }
    ).historyHotCacheService = {
      getFreshPage: vi.fn().mockReturnValue(null),
      getStalePage: vi.fn().mockReturnValue({
        source: HistoryHotCacheSource.STALE,
        page: {
          items: [buildHistoryItem('sol-stale-1')],
          nextOffset: null,
        },
      }),
    };

    const service: TrackingHistoryService = new TrackingHistoryService(deps);

    const message: string = await service.getAddressHistoryWithPolicy(
      {
        telegramId: '234',
        username: 'user2',
      },
      {
        rawAddress: '#9',
        rawLimit: '20',
        source: HistoryRequestSource.COMMAND,
        rawKind: HistoryKind.ALL,
        rawDirection: HistoryDirectionFilter.ALL,
      },
    );

    expect(message).toContain('sol-stale-1');
  });
});
