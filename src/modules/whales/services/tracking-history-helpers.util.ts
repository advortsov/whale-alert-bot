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

const HISTORY_USD_MAX_LOOKUPS_PER_PAGE = 3;
const HISTORY_USD_TIME_BUCKET_SEC = 3600;

interface IHistoryUsdContext {
  readonly amount: number;
  readonly timestampSec: number;
  readonly quoteCacheKey: string;
}

const buildUnavailableUsdItem = (item: IWalletHistoryListItem): IWalletHistoryListItem => ({
  ...item,
  usdPrice: null,
  usdAmount: null,
  usdUnavailable: true,
});

const buildQuoteCacheKey = (item: IWalletHistoryListItem, timestampSec: number): string => {
  const tokenAddress: string =
    normalizeTokenAddressForPricing(item.contractAddress)?.toLowerCase() ?? 'native';
  const symbol: string = (item.assetSymbol ?? 'UNKNOWN').trim().toUpperCase();
  const bucketSec: number = Math.floor(timestampSec / HISTORY_USD_TIME_BUCKET_SEC);
  return `${item.chainKey}:${tokenAddress}:${symbol}:${String(bucketSec)}`;
};

const resolveHistoryUsdContext = (item: IWalletHistoryListItem): IHistoryUsdContext | null => {
  const amount: number | null = parseAmountFromHistoryItem(item);
  const timestampSec: number | null = extractTimestampSec(item.occurredAt);

  if (amount === null || amount <= 0 || timestampSec === null || !Number.isFinite(timestampSec)) {
    return null;
  }

  return {
    amount,
    timestampSec,
    quoteCacheKey: buildQuoteCacheKey(item, timestampSec),
  };
};

const enrichHistoryItem = async (
  item: IWalletHistoryListItem,
  context: IHistoryUsdContext,
  tokenHistoricalPricingPort: ITokenHistoricalPricingPort,
): Promise<IWalletHistoryListItem> => {
  const quote: IHistoricalPriceQuoteDto | null = await tokenHistoricalPricingPort.getUsdQuoteAt({
    chainKey: item.chainKey,
    tokenAddress: normalizeTokenAddressForPricing(item.contractAddress),
    tokenSymbol: item.assetSymbol,
    timestampSec: context.timestampSec,
  });

  if (quote === null || !Number.isFinite(quote.usdPrice) || quote.usdPrice <= 0) {
    return buildUnavailableUsdItem(item);
  }

  return {
    ...item,
    usdPrice: quote.usdPrice,
    usdAmount: context.amount * quote.usdPrice,
    usdUnavailable: false,
  };
};

const buildResolvedUsdItem = (
  item: IWalletHistoryListItem,
  amount: number,
  usdPrice: number,
): IWalletHistoryListItem => {
  if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
    return buildUnavailableUsdItem(item);
  }

  return {
    ...item,
    usdPrice,
    usdAmount: amount * usdPrice,
    usdUnavailable: false,
  };
};

const resolvePreloadedUsdItem = (item: IWalletHistoryListItem): IWalletHistoryListItem | null => {
  if (item.usdPrice === null || item.usdAmount === null) {
    return null;
  }

  return {
    ...item,
    usdUnavailable: false,
  };
};

const resolveCachedUsdItem = (
  item: IWalletHistoryListItem,
  context: IHistoryUsdContext,
  usdPriceByKey: Map<string, number | null>,
): IWalletHistoryListItem | null => {
  const cachedUsdPrice: number | null | undefined = usdPriceByKey.get(context.quoteCacheKey);

  if (cachedUsdPrice === undefined) {
    return null;
  }

  if (cachedUsdPrice === null) {
    return buildUnavailableUsdItem(item);
  }

  return buildResolvedUsdItem(item, context.amount, cachedUsdPrice);
};

interface ILookupResult {
  readonly item: IWalletHistoryListItem;
  readonly lookupCount: number;
}

interface IEnrichWithLookupArgs {
  readonly item: IWalletHistoryListItem;
  readonly context: IHistoryUsdContext;
  readonly lookupCount: number;
  readonly usdPriceByKey: Map<string, number | null>;
  readonly tokenHistoricalPricingPort: ITokenHistoricalPricingPort;
}

const enrichWithLookup = async (args: IEnrichWithLookupArgs): Promise<ILookupResult> => {
  if (args.lookupCount >= HISTORY_USD_MAX_LOOKUPS_PER_PAGE) {
    args.usdPriceByKey.set(args.context.quoteCacheKey, null);
    return {
      item: buildUnavailableUsdItem(args.item),
      lookupCount: args.lookupCount,
    };
  }

  try {
    const enrichedItem: IWalletHistoryListItem = await enrichHistoryItem(
      args.item,
      args.context,
      args.tokenHistoricalPricingPort,
    );
    const resolvedUsdPrice: number | null = enrichedItem.usdPrice;
    args.usdPriceByKey.set(args.context.quoteCacheKey, resolvedUsdPrice);
    return {
      item: enrichedItem,
      lookupCount: args.lookupCount + 1,
    };
  } catch {
    args.usdPriceByKey.set(args.context.quoteCacheKey, null);
    return {
      item: buildUnavailableUsdItem(args.item),
      lookupCount: args.lookupCount + 1,
    };
  }
};

export const enrichWalletHistoryItems = async (
  items: readonly IWalletHistoryListItem[],
  tokenHistoricalPricingPort: ITokenHistoricalPricingPort,
): Promise<readonly IWalletHistoryListItem[]> => {
  const enrichedItems: IWalletHistoryListItem[] = [];
  const usdPriceByKey: Map<string, number | null> = new Map<string, number | null>();
  let lookupCount: number = 0;

  for (const item of items) {
    const preloadedUsdItem: IWalletHistoryListItem | null = resolvePreloadedUsdItem(item);
    if (preloadedUsdItem !== null) {
      enrichedItems.push(preloadedUsdItem);
      continue;
    }

    const usdContext: IHistoryUsdContext | null = resolveHistoryUsdContext(item);

    if (usdContext === null) {
      enrichedItems.push(buildUnavailableUsdItem(item));
      continue;
    }

    const cachedUsdItem: IWalletHistoryListItem | null = resolveCachedUsdItem(
      item,
      usdContext,
      usdPriceByKey,
    );
    if (cachedUsdItem !== null) {
      enrichedItems.push(cachedUsdItem);
      continue;
    }

    const lookupResult: ILookupResult = await enrichWithLookup({
      item,
      context: usdContext,
      lookupCount,
      usdPriceByKey,
      tokenHistoricalPricingPort,
    });
    lookupCount = lookupResult.lookupCount;
    enrichedItems.push(lookupResult.item);
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
