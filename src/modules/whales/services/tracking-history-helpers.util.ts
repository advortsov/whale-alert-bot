import type { HistoryCacheService } from './history-cache.service';
import type { HistoryHotCacheService } from './history-hot-cache.service';
import {
  extractTimestampSec,
  normalizeTokenAddressForPricing,
  parseAmountFromHistoryItem,
} from './history-value.util';
import type { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import type { TrackingHistoryPageService } from './tracking-history-page.service';
import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type {
  IHistoricalPriceQuoteDto,
  ITokenHistoricalPricingPort,
} from '../../../common/interfaces/token-pricing/token-pricing.interfaces';
import type { IHistoryHotCacheLookupResult } from '../entities/history-hot-cache.interfaces';
import type { IHistoryPageDto } from '../entities/history-item.dto';
import type { HistoryPageResult } from '../entities/history-page.interfaces';
import type { IParsedHistoryQueryParams } from '../entities/tracking-history-request.dto';
import type { IHistoryTargetSnapshot } from '../entities/tracking-history.interfaces';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

const buildUnavailableUsdItem = (item: IWalletHistoryListItem): IWalletHistoryListItem => ({
  ...item,
  usdPrice: null,
  usdAmount: null,
  usdUnavailable: true,
});

const enrichHistoryItem = async (
  item: IWalletHistoryListItem,
  tokenHistoricalPricingPort: ITokenHistoricalPricingPort,
): Promise<IWalletHistoryListItem> => {
  if (item.usdPrice !== null && item.usdAmount !== null) {
    return {
      ...item,
      usdUnavailable: false,
    };
  }

  const amount: number | null = parseAmountFromHistoryItem(item);
  const timestampSec: number | null = extractTimestampSec(item.occurredAt);

  if (amount === null || amount <= 0 || timestampSec === null || !Number.isFinite(timestampSec)) {
    return buildUnavailableUsdItem(item);
  }

  const quote: IHistoricalPriceQuoteDto | null = await tokenHistoricalPricingPort.getUsdQuoteAt({
    chainKey: item.chainKey,
    tokenAddress: normalizeTokenAddressForPricing(item.contractAddress),
    tokenSymbol: item.assetSymbol,
    timestampSec,
  });

  if (quote === null || !Number.isFinite(quote.usdPrice) || quote.usdPrice <= 0) {
    return buildUnavailableUsdItem(item);
  }

  return {
    ...item,
    usdPrice: quote.usdPrice,
    usdAmount: amount * quote.usdPrice,
    usdUnavailable: false,
  };
};

export const enrichWalletHistoryItems = async (
  items: readonly IWalletHistoryListItem[],
  tokenHistoricalPricingPort: ITokenHistoricalPricingPort,
): Promise<readonly IWalletHistoryListItem[]> => {
  const enrichedItems: IWalletHistoryListItem[] = [];

  for (const item of items) {
    enrichedItems.push(await enrichHistoryItem(item, tokenHistoricalPricingPort));
  }

  return enrichedItems;
};

interface IResolveHotCachePageLookupArgs {
  readonly historyHotCacheService: HistoryHotCacheService;
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly historyParams: IParsedHistoryQueryParams;
  readonly allowStale: boolean;
}

export const resolveHotCachePageLookup = (
  args: IResolveHotCachePageLookupArgs,
): IHistoryHotCacheLookupResult | null => {
  if (args.allowStale) {
    return args.historyHotCacheService.getStalePage({
      chainKey: args.chainKey,
      address: args.address,
      limit: args.historyParams.limit,
      offset: args.historyParams.offset,
      kind: args.historyParams.kind,
      direction: args.historyParams.direction,
    });
  }

  return args.historyHotCacheService.getFreshPage({
    chainKey: args.chainKey,
    address: args.address,
    limit: args.historyParams.limit,
    offset: args.historyParams.offset,
    kind: args.historyParams.kind,
    direction: args.historyParams.direction,
  });
};

export const setHistoryCacheEntry = (
  historyCacheService: HistoryCacheService,
  normalizedAddress: string,
  historyParams: IParsedHistoryQueryParams,
  message: string,
): void => {
  historyCacheService.set(normalizedAddress, historyParams.limit, message, {
    kind: historyParams.kind,
    direction: historyParams.direction,
  });
};

interface IBuildHistoryPageResultFromItemsArgs {
  readonly target: IHistoryTargetSnapshot;
  readonly historyParams: IParsedHistoryQueryParams;
  readonly page: IHistoryPageDto;
  readonly offset: number;
  readonly trackingHistoryPageService: TrackingHistoryPageService;
  readonly historyFormatter: TrackingHistoryFormatterService;
}

export const buildHistoryPageResultFromItems = (
  args: IBuildHistoryPageResultFromItemsArgs,
): HistoryPageResult => {
  const items = args.trackingHistoryPageService.mapExplorerItemsToListItems(
    args.page.items,
    args.target.chainKey,
  );
  const message: string = args.historyFormatter.formatHistoryListMessage(
    args.target.address,
    items,
    {
      offset: args.offset,
      kind: args.historyParams.kind,
      direction: args.historyParams.direction,
    },
  );

  return {
    message,
    resolvedAddress: args.target.address,
    walletId: args.target.walletId,
    limit: args.historyParams.limit,
    offset: args.offset,
    kind: args.historyParams.kind,
    direction: args.historyParams.direction,
    hasNextPage: args.page.nextOffset !== null,
    items,
    nextOffset: args.page.nextOffset,
  };
};
