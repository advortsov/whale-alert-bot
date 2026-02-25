import { Injectable, Logger } from '@nestjs/common';

import { buildHistoryRetryMessage, isRateLimitOrTimeout } from './tracking-history-errors.util';
import {
  buildHistoryPageResultFromItems,
  enrichWalletHistoryItems,
  resolveHotCachePageLookup,
  setHistoryCacheEntry,
} from './tracking-history-helpers.util';
import { TrackingHistoryServiceDependencies } from './tracking-history.service.dependencies';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { HistoryCacheEntry } from '../entities/history-cache.interfaces';
import type { IHistoryHotCacheLookupResult } from '../entities/history-hot-cache.interfaces';
import type { IHistoryPageDto } from '../entities/history-item.dto';
import type { HistoryPageResult } from '../entities/history-page.interfaces';
import {
  type HistoryRateLimitDecision,
  HistoryRequestSource,
} from '../entities/history-rate-limiter.interfaces';
import type {
  IParsedHistoryQueryParams,
  ITrackingHistoryPageRequestDto,
  ITrackingHistoryRequestDto,
} from '../entities/tracking-history-request.dto';
import type {
  IHistoryTargetSnapshot,
  IHistoryUserRef,
  ILoadHistoryWithFallbackContext,
  ILocalHistoryPageData,
  IRateLimitedHistoryContext,
} from '../entities/tracking-history.interfaces';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

interface IHistoryPageContext {
  readonly target: IHistoryTargetSnapshot;
  readonly historyParams: IParsedHistoryQueryParams;
}

@Injectable()
export class TrackingHistoryService {
  private readonly logger: Logger = new Logger(TrackingHistoryService.name);

  public constructor(private readonly deps: TrackingHistoryServiceDependencies) {}

  public async getAddressHistory(
    userRef: IHistoryUserRef,
    request: Omit<ITrackingHistoryRequestDto, 'source'>,
  ): Promise<string> {
    return this.getAddressHistoryWithPolicy(userRef, {
      ...request,
      source: HistoryRequestSource.COMMAND,
    });
  }

  public async getAddressHistoryPageWithPolicy(
    userRef: IHistoryUserRef,
    request: ITrackingHistoryPageRequestDto,
  ): Promise<HistoryPageResult> {
    const context: IHistoryPageContext = await this.resolveHistoryPageContext(userRef, request);
    this.assertHistoryRequestAllowed(userRef.telegramId, request.source);
    const localPageResult: HistoryPageResult | null = await this.tryBuildLocalOffsetPage(context);
    if (localPageResult !== null) {
      return this.enrichHistoryPageResult(localPageResult);
    }
    const hotPageResult: HistoryPageResult | null = this.tryBuildHotOffsetPage(context, false);
    if (hotPageResult !== null) {
      return this.enrichHistoryPageResult(hotPageResult);
    }
    const explorerPageResult: HistoryPageResult =
      await this.buildExplorerOffsetPageWithFallback(context);
    return this.enrichHistoryPageResult(explorerPageResult);
  }

  public async getAddressHistoryWithPolicy(
    userRef: IHistoryUserRef,
    request: ITrackingHistoryRequestDto,
  ): Promise<string> {
    this.logger.debug(
      `getAddressHistoryWithPolicy start telegramId=${userRef.telegramId} source=${request.source} rawAddress=${request.rawAddress} rawLimit=${request.rawLimit ?? 'n/a'}`,
    );

    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const historyTarget = await this.deps.trackingAddressService.resolveHistoryTarget(
      user.id,
      request.rawAddress,
    );
    const historyParams: IParsedHistoryQueryParams =
      this.deps.historyQueryParserService.parseHistoryParams({
        ...request,
        rawOffset: null,
      });

    this.deps.trackingAddressService.assertHistoryChainIsSupported(historyTarget.chainKey);

    const normalizedAddress: string = historyTarget.address;
    const decision: HistoryRateLimitDecision = this.deps.historyRateLimiterService.evaluate(
      userRef.telegramId,
      request.source,
    );

    if (!decision.allowed) {
      return this.resolveRateLimitedHistory({
        telegramId: userRef.telegramId,
        source: request.source,
        normalizedAddress,
        historyParams,
        decision,
      });
    }

    const freshEntry: HistoryCacheEntry | null = this.deps.historyCacheService.getFresh(
      normalizedAddress,
      historyParams.limit,
      {
        kind: historyParams.kind,
        direction: historyParams.direction,
      },
    );

    if (freshEntry != null) {
      this.logger.debug(
        `history_cache_hit telegramId=${userRef.telegramId} source=${request.source} address=${normalizedAddress} limit=${String(historyParams.limit)}`,
      );
      return freshEntry.message;
    }

    return this.loadHistoryWithFallback({
      telegramId: userRef.telegramId,
      source: request.source,
      chainKey: historyTarget.chainKey,
      normalizedAddress,
      historyParams,
    });
  }

  private assertHistoryRequestAllowed(telegramId: string, source: HistoryRequestSource): void {
    const decision: HistoryRateLimitDecision = this.deps.historyRateLimiterService.evaluate(
      telegramId,
      source,
    );

    if (!decision.allowed) {
      throw new Error(buildHistoryRetryMessage(decision));
    }
  }

  private async resolveRateLimitedHistory(
    context: IRateLimitedHistoryContext & {
      readonly decision: HistoryRateLimitDecision;
    },
  ): Promise<string> {
    this.logger.warn(
      `history_rate_limited telegramId=${context.telegramId} source=${context.source} address=${context.normalizedAddress} limit=${String(context.historyParams.limit)} reason=${context.decision.reason} retryAfterSec=${String(context.decision.retryAfterSec ?? 0)}`,
    );

    const staleEntry: HistoryCacheEntry | null = this.deps.historyCacheService.getStale(
      context.normalizedAddress,
      context.historyParams.limit,
      {
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
      },
    );

    if (staleEntry != null) {
      this.logger.warn(
        `history_stale_served telegramId=${context.telegramId} source=${context.source} address=${context.normalizedAddress} limit=${String(context.historyParams.limit)} reason=local_rate_limit`,
      );
      return this.deps.historyFormatter.buildStaleMessage(staleEntry.message);
    }

    throw new Error(buildHistoryRetryMessage(context.decision));
  }

  private async loadHistoryWithFallback(context: ILoadHistoryWithFallbackContext): Promise<string> {
    try {
      const localMessage: string | null = await this.tryBuildLocalHistoryMessage(context);
      if (localMessage !== null) {
        return localMessage;
      }
      const hotMessage: string | null = await this.tryBuildHotHistoryMessage(context, false);
      if (hotMessage !== null) {
        return hotMessage;
      }
      return await this.buildExplorerHistoryMessage(context);
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `history_fetch_failed telegramId=${context.telegramId} source=${context.source} address=${context.normalizedAddress} limit=${String(context.historyParams.limit)} reason=${errorMessage}`,
      );

      if (!isRateLimitOrTimeout(errorMessage)) {
        throw error;
      }
      return this.resolveRateLimitedFallback(context);
    }
  }

  private async resolveHistoryPageContext(
    userRef: IHistoryUserRef,
    request: ITrackingHistoryPageRequestDto,
  ): Promise<IHistoryPageContext> {
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const historyTarget = await this.deps.trackingAddressService.resolveHistoryTarget(
      user.id,
      request.rawAddress,
    );
    const historyParams: IParsedHistoryQueryParams =
      this.deps.historyQueryParserService.parseHistoryParams(request);
    this.deps.trackingAddressService.assertHistoryChainIsSupported(historyTarget.chainKey);

    return {
      target: {
        address: historyTarget.address,
        walletId: historyTarget.walletId,
        chainKey: historyTarget.chainKey,
      },
      historyParams,
    };
  }

  private async tryBuildLocalOffsetPage(
    context: IHistoryPageContext,
  ): Promise<HistoryPageResult | null> {
    const localHistoryPage: ILocalHistoryPageData =
      await this.deps.trackingHistoryPageService.loadLocalHistoryPage({
        chainKey: context.target.chainKey,
        normalizedAddress: context.target.address,
        historyParams: context.historyParams,
      });
    if (localHistoryPage.pageEvents.length === 0) {
      return null;
    }
    const shouldPreferExplorerOnShortFirstPage: boolean =
      context.target.chainKey !== ChainKey.ETHEREUM_MAINNET;
    const isShortFirstPage: boolean =
      shouldPreferExplorerOnShortFirstPage &&
      context.historyParams.offset === 0 &&
      localHistoryPage.pageEvents.length < context.historyParams.limit;
    if (isShortFirstPage) {
      return null;
    }
    this.logger.debug(
      `history_source_selected source=local chain=${context.target.chainKey} address=${context.target.address} offset=${String(context.historyParams.offset)} limit=${String(context.historyParams.limit)}`,
    );
    return this.deps.historyPageBuilderService.buildOffsetHistoryPage({
      target: context.target,
      historyParams: context.historyParams,
      localHistoryPage,
    });
  }

  private tryBuildHotOffsetPage(
    context: IHistoryPageContext,
    allowStale: boolean,
  ): HistoryPageResult | null {
    const hotLookup: IHistoryHotCacheLookupResult | null = resolveHotCachePageLookup({
      historyHotCacheService: this.deps.historyHotCacheService,
      chainKey: context.target.chainKey,
      address: context.target.address,
      historyParams: context.historyParams,
      allowStale,
    });
    if (hotLookup === null || hotLookup.page.items.length === 0) {
      return null;
    }
    const source: string = allowStale ? 'hot_stale' : 'hot';
    this.logger.debug(
      `history_source_selected source=${source} chain=${context.target.chainKey} address=${context.target.address} offset=${String(context.historyParams.offset)} limit=${String(context.historyParams.limit)}`,
    );
    return buildHistoryPageResultFromItems({
      target: context.target,
      historyParams: context.historyParams,
      page: hotLookup.page,
      offset: context.historyParams.offset,
      trackingHistoryPageService: this.deps.trackingHistoryPageService,
      historyFormatter: this.deps.historyFormatter,
    });
  }

  private async buildExplorerOffsetPageWithFallback(
    context: IHistoryPageContext,
  ): Promise<HistoryPageResult> {
    try {
      this.logger.debug(
        `history_source_selected source=explorer chain=${context.target.chainKey} address=${context.target.address} offset=${String(context.historyParams.offset)} limit=${String(context.historyParams.limit)}`,
      );
      return await this.deps.historyPageBuilderService.buildOffsetHistoryPageFromExplorer({
        target: context.target,
        historyParams: context.historyParams,
      });
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      if (!isRateLimitOrTimeout(errorMessage)) {
        throw error;
      }
      const staleResult: HistoryPageResult | null = this.tryBuildHotOffsetPage(context, true);
      if (staleResult !== null) {
        return staleResult;
      }
      throw new Error(
        'Внешний API временно ограничил доступ (429). Повтори через несколько секунд.',
      );
    }
  }

  private async tryBuildLocalHistoryMessage(
    context: ILoadHistoryWithFallbackContext,
  ): Promise<string | null> {
    const localHistoryPage: ILocalHistoryPageData =
      await this.deps.trackingHistoryPageService.loadLocalHistoryPage({
        chainKey: context.chainKey,
        normalizedAddress: context.normalizedAddress,
        historyParams: {
          ...context.historyParams,
          offset: 0,
        },
      });
    if (localHistoryPage.pageEvents.length === 0) {
      return null;
    }
    this.logger.debug(
      `history_source_selected source=local chain=${context.chainKey} address=${context.normalizedAddress} offset=0 limit=${String(context.historyParams.limit)}`,
    );
    const items = this.deps.trackingHistoryPageService.mapWalletEventsToListItems(
      localHistoryPage.pageEvents,
      context.chainKey,
    );
    const enrichedItems: readonly IWalletHistoryListItem[] = await enrichWalletHistoryItems(
      items,
      this.deps.tokenHistoricalPricingPort,
    );
    const message: string = this.deps.historyFormatter.formatHistoryListMessage(
      context.normalizedAddress,
      enrichedItems,
      {
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
      },
    );
    setHistoryCacheEntry(
      this.deps.historyCacheService,
      context.normalizedAddress,
      context.historyParams,
      message,
    );
    return message;
  }

  private async tryBuildHotHistoryMessage(
    context: ILoadHistoryWithFallbackContext,
    allowStale: boolean,
  ): Promise<string | null> {
    const hotLookup: IHistoryHotCacheLookupResult | null = resolveHotCachePageLookup({
      historyHotCacheService: this.deps.historyHotCacheService,
      chainKey: context.chainKey,
      address: context.normalizedAddress,
      historyParams: context.historyParams,
      allowStale,
    });
    if (hotLookup === null || hotLookup.page.items.length === 0) {
      return null;
    }
    const source: string = allowStale ? 'hot_stale' : 'hot';
    this.logger.debug(
      `history_source_selected source=${source} chain=${context.chainKey} address=${context.normalizedAddress} offset=0 limit=${String(context.historyParams.limit)}`,
    );
    const items = this.deps.trackingHistoryPageService.mapExplorerItemsToListItems(
      hotLookup.page.items,
      context.chainKey,
    );
    const enrichedItems: readonly IWalletHistoryListItem[] = await enrichWalletHistoryItems(
      items,
      this.deps.tokenHistoricalPricingPort,
    );
    const message: string = this.deps.historyFormatter.formatHistoryListMessage(
      context.normalizedAddress,
      enrichedItems,
      {
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
      },
    );
    if (!allowStale) {
      setHistoryCacheEntry(
        this.deps.historyCacheService,
        context.normalizedAddress,
        context.historyParams,
        message,
      );
    }
    return message;
  }

  private async buildExplorerHistoryMessage(
    context: ILoadHistoryWithFallbackContext,
  ): Promise<string> {
    this.logger.debug(
      `history_source_selected source=explorer chain=${context.chainKey} address=${context.normalizedAddress} offset=0 limit=${String(context.historyParams.limit)}`,
    );
    const historyPage: IHistoryPageDto =
      await this.deps.historyExplorerAdapter.loadRecentTransactions({
        chainKey: context.chainKey,
        address: context.normalizedAddress,
        limit: context.historyParams.limit,
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        minAmountUsd: null,
      });
    const items = this.deps.trackingHistoryPageService.mapExplorerItemsToListItems(
      historyPage.items,
      context.chainKey,
    );
    const enrichedItems: readonly IWalletHistoryListItem[] = await enrichWalletHistoryItems(
      items,
      this.deps.tokenHistoricalPricingPort,
    );
    const historyMessage: string = this.deps.historyFormatter.formatHistoryListMessage(
      context.normalizedAddress,
      enrichedItems,
      {
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
      },
    );
    setHistoryCacheEntry(
      this.deps.historyCacheService,
      context.normalizedAddress,
      context.historyParams,
      historyMessage,
    );
    return historyMessage;
  }

  private async resolveRateLimitedFallback(
    context: ILoadHistoryWithFallbackContext,
  ): Promise<string> {
    const staleEntry: HistoryCacheEntry | null = this.deps.historyCacheService.getStale(
      context.normalizedAddress,
      context.historyParams.limit,
      {
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
      },
    );
    if (staleEntry !== null) {
      this.logger.warn(
        `history_stale_served telegramId=${context.telegramId} source=${context.source} address=${context.normalizedAddress} limit=${String(context.historyParams.limit)} reason=external_rate_limit`,
      );
      return this.deps.historyFormatter.buildStaleMessage(staleEntry.message);
    }
    const staleHotMessage: string | null = await this.tryBuildHotHistoryMessage(context, true);
    if (staleHotMessage !== null) {
      return staleHotMessage;
    }
    throw new Error('Внешний API временно ограничил доступ (429). Повтори через несколько секунд.');
  }

  private async enrichHistoryPageResult(page: HistoryPageResult): Promise<HistoryPageResult> {
    const enrichedItems: readonly IWalletHistoryListItem[] = await enrichWalletHistoryItems(
      page.items,
      this.deps.tokenHistoricalPricingPort,
    );
    const enrichedMessage: string = this.deps.historyFormatter.formatHistoryListMessage(
      page.resolvedAddress,
      enrichedItems,
      {
        offset: page.offset,
        kind: page.kind,
        direction: page.direction,
      },
    );

    return {
      ...page,
      message: enrichedMessage,
      items: enrichedItems,
    };
  }
}
