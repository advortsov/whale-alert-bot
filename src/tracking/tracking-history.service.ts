import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  IParsedHistoryQueryParams,
  ITrackingHistoryPageRequestDto,
  ITrackingHistoryRequestDto,
} from './dto/tracking-history-request.dto';
import type { HistoryCacheEntry } from './history-cache.interfaces';
import { HistoryCacheService } from './history-cache.service';
import type { HistoryPageResult } from './history-page.interfaces';
import {
  type HistoryRateLimitDecision,
  HistoryRateLimitReason,
  HistoryRequestSource,
} from './history-rate-limiter.interfaces';
import { HistoryRateLimiterService } from './history-rate-limiter.service';
import { TrackingAddressService } from './tracking-address.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingHistoryQueryParserService } from './tracking-history-query-parser.service';
import type {
  IFirstHistoryPageContext,
  IHistoryUserRef,
  IHistoryTargetSnapshot,
  ILoadHistoryWithFallbackContext,
  IRateLimitedHistoryContext,
} from './tracking-history.interfaces';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { HISTORY_EXPLORER_ADAPTER } from '../core/ports/explorers/explorer-port.tokens';
import type { IHistoryExplorerAdapter } from '../core/ports/explorers/history-explorer.interfaces';
import type { IHistoryPageDto } from '../features/tracking/dto/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';
import { UsersRepository } from '../database/repositories/users.repository';
import { WalletEventsRepository } from '../database/repositories/wallet-events.repository';
import type { WalletEventHistoryView } from '../database/repositories/wallet-events.repository.interfaces';

const LOCAL_EVENTS_BUFFER = 50;
const LOCAL_EVENTS_MAX_FETCH = 200;

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

  @Inject(WalletEventsRepository)
  public readonly walletEventsRepository!: WalletEventsRepository;

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
    const localEventsWithProbe: readonly WalletEventHistoryView[] =
      await this.loadLocalEventsForHistory(
        historyTarget.chainKey,
        historyTarget.address,
        historyParams,
      );

    if (localEventsWithProbe.length === 0) {
      throw new Error('Нет дополнительных локальных событий. Нажми «Обновить».');
    }

    return this.buildOffsetHistoryPage({
      target,
      historyParams,
      localEventsWithProbe,
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

    if (freshEntry !== null) {
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
    const localEventsWithFilters: readonly WalletEventHistoryView[] =
      await this.loadLocalEventsForHistory(
        context.target.chainKey,
        context.target.address,
        context.historyParams,
      );

    return {
      message,
      resolvedAddress: context.target.address,
      walletId: context.target.walletId,
      limit: context.historyParams.limit,
      offset: 0,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      hasNextPage: localEventsWithFilters.length > context.historyParams.limit,
    };
  }

  private buildOffsetHistoryPage(context: {
    readonly target: IHistoryTargetSnapshot;
    readonly historyParams: IParsedHistoryQueryParams;
    readonly localEventsWithProbe: readonly WalletEventHistoryView[];
  }): HistoryPageResult {
    const pageEvents: readonly WalletEventHistoryView[] = context.localEventsWithProbe.slice(
      0,
      context.historyParams.limit,
    );
    const message: string = this.deps.historyFormatter.formatWalletEventsHistoryMessage(
      context.target.address,
      pageEvents,
      {
        offset: context.historyParams.offset,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        chainKey: context.target.chainKey,
      },
    );

    return {
      message,
      resolvedAddress: context.target.address,
      walletId: context.target.walletId,
      limit: context.historyParams.limit,
      offset: context.historyParams.offset,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      hasNextPage: context.localEventsWithProbe.length > context.historyParams.limit,
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

    if (staleEntry !== null) {
      this.logger.warn(
        `history_stale_served telegramId=${context.telegramId} source=${context.source} address=${context.normalizedAddress} limit=${String(context.historyParams.limit)} reason=local_rate_limit`,
      );
      return this.deps.historyFormatter.buildStaleMessage(staleEntry.message);
    }

    throw new Error(this.buildHistoryRetryMessage(context.decision));
  }

  private async loadHistoryWithFallback(context: ILoadHistoryWithFallbackContext): Promise<string> {
    try {
      const localEvents: readonly WalletEventHistoryView[] = await this.loadLocalEventsForHistory(
        context.chainKey,
        context.normalizedAddress,
        {
          ...context.historyParams,
          offset: 0,
        },
      );

      if (localEvents.length > 0) {
        const message: string = this.deps.historyFormatter.formatWalletEventsHistoryMessage(
          context.normalizedAddress,
          localEvents,
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

      if (staleEntry !== null) {
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

  private async loadLocalEventsForHistory(
    chainKey: ChainKey,
    normalizedAddress: string,
    historyParams: IParsedHistoryQueryParams,
  ): Promise<readonly WalletEventHistoryView[]> {
    const rawFetchLimit: number = Math.min(
      Math.max(
        historyParams.offset + historyParams.limit + LOCAL_EVENTS_BUFFER,
        historyParams.limit,
      ),
      LOCAL_EVENTS_MAX_FETCH,
    );
    const rawEvents: readonly WalletEventHistoryView[] =
      await this.deps.walletEventsRepository.listRecentByTrackedAddress(
        chainKey,
        normalizedAddress,
        rawFetchLimit,
        0,
      );

    const filteredEvents: readonly WalletEventHistoryView[] = rawEvents.filter(
      (event: WalletEventHistoryView): boolean => {
        if (historyParams.direction === HistoryDirectionFilter.IN && event.direction !== 'IN') {
          return false;
        }

        if (historyParams.direction === HistoryDirectionFilter.OUT && event.direction !== 'OUT') {
          return false;
        }

        if (historyParams.kind === HistoryKind.ETH) {
          return event.tokenAddress === null || event.tokenSymbol === 'ETH';
        }

        if (historyParams.kind === HistoryKind.ERC20) {
          return event.tokenAddress !== null && event.tokenSymbol !== 'ETH';
        }

        return true;
      },
    );

    if (historyParams.offset <= 0) {
      return filteredEvents.slice(0, historyParams.limit);
    }

    return filteredEvents.slice(
      historyParams.offset,
      historyParams.offset + historyParams.limit + 1,
    );
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
