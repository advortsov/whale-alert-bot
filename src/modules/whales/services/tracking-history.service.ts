import { Inject, Injectable, Logger } from '@nestjs/common';

import { HistoryCacheService } from './history-cache.service';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingAddressService } from './tracking-address.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingHistoryPageService } from './tracking-history-page.service';
import { TrackingHistoryQueryParserService } from './tracking-history-query-parser.service';
import { HISTORY_EXPLORER_ADAPTER } from '../../../common/interfaces/explorers/explorer-port.tokens';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import { UsersRepository } from '../../../database/repositories/users.repository';
import type { HistoryCacheEntry } from '../entities/history-cache.interfaces';
import type { IHistoryPageDto } from '../entities/history-item.dto';
import type { HistoryPageResult } from '../entities/history-page.interfaces';
import {
  type HistoryRateLimitDecision,
  HistoryRateLimitReason,
  HistoryRequestSource,
} from '../entities/history-rate-limiter.interfaces';
import type {
  IParsedHistoryQueryParams,
  ITrackingHistoryPageRequestDto,
  ITrackingHistoryRequestDto,
} from '../entities/tracking-history-request.dto';
import type {
  IFirstHistoryPageContext,
  IHistoryTargetSnapshot,
  IHistoryUserRef,
  ILoadHistoryWithFallbackContext,
  ILocalHistoryPageData,
  IRateLimitedHistoryContext,
} from '../entities/tracking-history.interfaces';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

@Injectable()
export class TrackingHistoryServiceDependencies {
  @Inject(UsersRepository)
  public readonly usersRepository!: UsersRepository;

  @Inject(TrackingAddressService)
  public readonly trackingAddressService!: TrackingAddressService;

  @Inject(HISTORY_EXPLORER_ADAPTER)
  public readonly historyExplorerAdapter!: IHistoryExplorerAdapter;

  @Inject(HistoryCacheService)
  public readonly historyCacheService!: HistoryCacheService;

  @Inject(HistoryRateLimiterService)
  public readonly historyRateLimiterService!: HistoryRateLimiterService;

  @Inject(TrackingHistoryPageService)
  public readonly trackingHistoryPageService!: TrackingHistoryPageService;

  @Inject(TrackingHistoryFormatterService)
  public readonly historyFormatter!: TrackingHistoryFormatterService;

  @Inject(TrackingHistoryQueryParserService)
  public readonly historyQueryParserService!: TrackingHistoryQueryParserService;
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
    const user = await this.deps.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const historyTarget = await this.deps.trackingAddressService.resolveHistoryTarget(
      user.id,
      request.rawAddress,
    );
    const historyParams: IParsedHistoryQueryParams =
      this.deps.historyQueryParserService.parseHistoryParams(request);

    this.deps.trackingAddressService.assertHistoryChainIsSupported(historyTarget.chainKey);

    const target: IHistoryTargetSnapshot = {
      address: historyTarget.address,
      walletId: historyTarget.walletId,
      chainKey: historyTarget.chainKey,
    };

    if (historyParams.offset === 0) {
      return this.buildFirstHistoryPage({
        userRef,
        request,
        target,
        historyParams,
      });
    }

    this.assertHistoryRequestAllowed(userRef.telegramId, request.source);

    const localHistoryPage: ILocalHistoryPageData =
      await this.deps.trackingHistoryPageService.loadLocalHistoryPage({
        chainKey: historyTarget.chainKey,
        normalizedAddress: historyTarget.address,
        historyParams,
      });

    if (localHistoryPage.pageEvents.length === 0) {
      return this.buildOffsetHistoryPageFromExplorer({
        target,
        historyParams,
      });
    }

    return this.buildOffsetHistoryPage({
      target,
      historyParams,
      localHistoryPage,
    });
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

  private async buildFirstHistoryPage(
    context: IFirstHistoryPageContext,
  ): Promise<HistoryPageResult> {
    const message: string = await this.getAddressHistoryWithPolicy(context.userRef, {
      rawAddress: context.request.rawAddress,
      rawLimit: String(context.historyParams.limit),
      source: context.request.source,
      rawKind: context.request.rawKind,
      rawDirection: context.request.rawDirection,
    });

    const localHistoryPage: ILocalHistoryPageData =
      await this.deps.trackingHistoryPageService.loadLocalHistoryPage({
        chainKey: context.target.chainKey,
        normalizedAddress: context.target.address,
        historyParams: context.historyParams,
      });

    const localItems: readonly IWalletHistoryListItem[] =
      this.deps.trackingHistoryPageService.mapWalletEventsToListItems(
        localHistoryPage.pageEvents,
        context.target.chainKey,
      );

    if (localItems.length > 0) {
      return {
        message,
        resolvedAddress: context.target.address,
        walletId: context.target.walletId,
        limit: context.historyParams.limit,
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        hasNextPage: localHistoryPage.hasNextPage,
        items: localItems,
        nextOffset: localHistoryPage.nextOffset,
      };
    }

    let explorerPage: IHistoryPageDto = {
      items: [],
      nextOffset: null,
    };

    try {
      explorerPage = await this.deps.historyExplorerAdapter.loadRecentTransactions({
        chainKey: context.target.chainKey,
        address: context.target.address,
        limit: context.historyParams.limit,
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        minAmountUsd: null,
      });
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `history_page_items_fallback_failed address=${context.target.address} chain=${context.target.chainKey} reason=${errorMessage}`,
      );
    }

    const explorerItems: readonly IWalletHistoryListItem[] =
      this.deps.trackingHistoryPageService.mapExplorerItemsToListItems(
        explorerPage.items,
        context.target.chainKey,
      );

    return {
      message,
      resolvedAddress: context.target.address,
      walletId: context.target.walletId,
      limit: context.historyParams.limit,
      offset: 0,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      hasNextPage: explorerPage.nextOffset !== null,
      items: explorerItems,
      nextOffset: explorerPage.nextOffset,
    };
  }

  private buildOffsetHistoryPage(context: {
    readonly target: IHistoryTargetSnapshot;
    readonly historyParams: IParsedHistoryQueryParams;
    readonly localHistoryPage: ILocalHistoryPageData;
  }): HistoryPageResult {
    const message: string = this.deps.historyFormatter.formatWalletEventsHistoryMessage(
      context.target.address,
      context.localHistoryPage.pageEvents,
      {
        offset: context.historyParams.offset,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        chainKey: context.target.chainKey,
      },
    );

    const items: readonly IWalletHistoryListItem[] =
      this.deps.trackingHistoryPageService.mapWalletEventsToListItems(
        context.localHistoryPage.pageEvents,
        context.target.chainKey,
      );

    return {
      message,
      resolvedAddress: context.target.address,
      walletId: context.target.walletId,
      limit: context.historyParams.limit,
      offset: context.historyParams.offset,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      hasNextPage: context.localHistoryPage.hasNextPage,
      items,
      nextOffset: context.localHistoryPage.nextOffset,
    };
  }

  private async buildOffsetHistoryPageFromExplorer(context: {
    readonly target: IHistoryTargetSnapshot;
    readonly historyParams: IParsedHistoryQueryParams;
  }): Promise<HistoryPageResult> {
    const explorerPage: IHistoryPageDto =
      await this.deps.historyExplorerAdapter.loadRecentTransactions({
        chainKey: context.target.chainKey,
        address: context.target.address,
        limit: context.historyParams.limit,
        offset: context.historyParams.offset,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        minAmountUsd: null,
      });
    const message: string = this.deps.historyFormatter.formatHistoryMessage(
      context.target.address,
      explorerPage.items,
    );
    const items: readonly IWalletHistoryListItem[] =
      this.deps.trackingHistoryPageService.mapExplorerItemsToListItems(
        explorerPage.items,
        context.target.chainKey,
      );

    return {
      message,
      resolvedAddress: context.target.address,
      walletId: context.target.walletId,
      limit: context.historyParams.limit,
      offset: context.historyParams.offset,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      hasNextPage: explorerPage.nextOffset !== null,
      items,
      nextOffset: explorerPage.nextOffset,
    };
  }

  private assertHistoryRequestAllowed(telegramId: string, source: HistoryRequestSource): void {
    const decision: HistoryRateLimitDecision = this.deps.historyRateLimiterService.evaluate(
      telegramId,
      source,
    );

    if (!decision.allowed) {
      throw new Error(this.buildHistoryRetryMessage(decision));
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

    throw new Error(this.buildHistoryRetryMessage(context.decision));
  }

  private async loadHistoryWithFallback(context: ILoadHistoryWithFallbackContext): Promise<string> {
    try {
      const localHistoryPage: ILocalHistoryPageData =
        await this.deps.trackingHistoryPageService.loadLocalHistoryPage({
          chainKey: context.chainKey,
          normalizedAddress: context.normalizedAddress,
          historyParams: {
            ...context.historyParams,
            offset: 0,
          },
        });

      if (localHistoryPage.pageEvents.length > 0) {
        const message: string = this.deps.historyFormatter.formatWalletEventsHistoryMessage(
          context.normalizedAddress,
          localHistoryPage.pageEvents,
          {
            offset: 0,
            kind: context.historyParams.kind,
            direction: context.historyParams.direction,
            chainKey: context.chainKey,
          },
        );
        this.cacheHistory(context.normalizedAddress, context.historyParams, message);
        return message;
      }

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

      const historyMessage: string = this.deps.historyFormatter.formatHistoryMessage(
        context.normalizedAddress,
        historyPage.items,
      );
      this.cacheHistory(context.normalizedAddress, context.historyParams, historyMessage);
      return historyMessage;
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `history_fetch_failed telegramId=${context.telegramId} source=${context.source} address=${context.normalizedAddress} limit=${String(context.historyParams.limit)} reason=${errorMessage}`,
      );

      if (!this.isRateLimitOrTimeout(errorMessage)) {
        throw error;
      }

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
          `history_stale_served telegramId=${context.telegramId} source=${context.source} address=${context.normalizedAddress} limit=${String(context.historyParams.limit)} reason=external_rate_limit`,
        );
        return this.deps.historyFormatter.buildStaleMessage(staleEntry.message);
      }

      throw new Error(
        'Внешний API временно ограничил доступ (429). Повтори через несколько секунд.',
      );
    }
  }

  private cacheHistory(
    normalizedAddress: string,
    historyParams: IParsedHistoryQueryParams,
    message: string,
  ): void {
    this.deps.historyCacheService.set(normalizedAddress, historyParams.limit, message, {
      kind: historyParams.kind,
      direction: historyParams.direction,
    });
  }

  private buildHistoryRetryMessage(decision: HistoryRateLimitDecision): string {
    const retryAfterSec: number = decision.retryAfterSec ?? 1;

    if (decision.reason === HistoryRateLimitReason.CALLBACK_COOLDOWN) {
      return `Слишком часто нажимаешь кнопку истории. Повтори через ${String(retryAfterSec)} сек.`;
    }

    return `Слишком много запросов к истории. Повтори через ${String(retryAfterSec)} сек.`;
  }

  private isRateLimitOrTimeout(errorMessage: string): boolean {
    const normalizedMessage: string = errorMessage.toLowerCase();

    return (
      normalizedMessage.includes('rate limit') ||
      normalizedMessage.includes('http 429') ||
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('aborted') ||
      normalizedMessage.includes('too many requests')
    );
  }
}
