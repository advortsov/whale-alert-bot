import { Injectable, Logger, Optional } from '@nestjs/common';

import {
  HISTORY_WARN_COOLDOWN_MS,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  QUERY_POLICIES,
  RESPONSE_PREVIEW_MAX_LENGTH,
  TRON_HISTORY_REQUEST_TIMEOUT_MS,
  TRON_MAX_PAGE_REQUESTS,
  TRON_MAX_PAGE_SIZE,
  TronGridBadRequestError,
  type ITronGridFallbackResult,
  type ITronGridPageLoadResult,
  type ITronGridPageRequestOptions,
  type ITronGridRequestQueryPolicy,
  resolveTronHistoryLimiterKey,
} from './tron-grid-history.constants';
import type {
  ITronGridListResponse,
  ITronGridNativeTransactionItem,
  ITronGridTrc20TransactionItem,
} from './tron-grid-history.interfaces';
import { TronGridHistoryMapper } from './tron-grid-history.mapper';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import { RateLimitedWarningEmitter } from '../../../common/utils/logging/rate-limited-warning-emitter';
import { AppConfigService } from '../../../config/app-config.service';
import {
  LimiterKey,
  RequestPriority,
} from '../../../modules/blockchain/rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../../../modules/blockchain/rate-limiting/bottleneck-rate-limiter.service';
import { TronAddressCodec } from '../../../modules/chains/tron/tron-address.codec';
import { MetricsService } from '../../observability/metrics.service';
import { type IHistoryItemDto, type IHistoryPageDto } from '../../whales/entities/history-item.dto';
import { HistoryKind, type IHistoryRequestDto } from '../../whales/entities/history-request.dto';

@Injectable()
export class TronGridHistoryAdapter implements IHistoryExplorerAdapter {
  private readonly logger: Logger = new Logger(TronGridHistoryAdapter.name);
  private readonly mapper: TronGridHistoryMapper;
  private readonly warningEmitter: RateLimitedWarningEmitter = new RateLimitedWarningEmitter(
    HISTORY_WARN_COOLDOWN_MS,
  );

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly tronAddressCodec: TronAddressCodec,
    private readonly rateLimiterService: BottleneckRateLimiterService,
    @Optional() private readonly metricsService: MetricsService | null = null,
  ) {
    this.mapper = new TronGridHistoryMapper(
      this.tronAddressCodec,
      this.appConfigService.tronscanTxBaseUrl,
    );
  }

  public async loadRecentTransactions(request: IHistoryRequestDto): Promise<IHistoryPageDto> {
    if (request.chainKey !== ChainKey.TRON_MAINNET) {
      throw new Error(`TRON history adapter does not support chain ${request.chainKey}.`);
    }

    const targetItemsCount: number = request.offset + request.limit + 1;
    const nativeItems: readonly IHistoryItemDto[] =
      request.kind === HistoryKind.ERC20
        ? []
        : await this.loadNativeTransactions(request.address, targetItemsCount);
    const tokenItems: readonly IHistoryItemDto[] =
      request.kind === HistoryKind.ETH
        ? []
        : await this.loadTrc20Transactions(request.address, targetItemsCount);
    const mergedItems: IHistoryItemDto[] = [...nativeItems, ...tokenItems];
    mergedItems.sort(
      (leftItem: IHistoryItemDto, rightItem: IHistoryItemDto): number =>
        rightItem.timestampSec - leftItem.timestampSec,
    );

    const filteredItems: readonly IHistoryItemDto[] = this.mapper.applyDirectionFilter(
      mergedItems,
      request.direction,
    );
    const pagedItems: readonly IHistoryItemDto[] = filteredItems.slice(
      request.offset,
      request.offset + request.limit,
    );
    const hasNextPage: boolean = filteredItems.length > request.offset + request.limit;

    return {
      items: pagedItems,
      nextOffset: hasNextPage ? request.offset + request.limit : null,
    };
  }

  private async loadNativeTransactions(
    address: string,
    targetItemsCount: number,
  ): Promise<readonly IHistoryItemDto[]> {
    const results: IHistoryItemDto[] = [];
    let fingerprint: string | null = null;
    let requestCount: number = 0;
    let resolvedPolicy: ITronGridRequestQueryPolicy | null = null;
    const pageSize: number = Math.min(TRON_MAX_PAGE_SIZE, targetItemsCount);

    while (results.length < targetItemsCount && requestCount < TRON_MAX_PAGE_REQUESTS) {
      const options: ITronGridPageRequestOptions = {
        path: `/v1/accounts/${address}/transactions`,
        pageSize,
        fingerprint,
      };

      let page: ITronGridPageLoadResult<ITronGridNativeTransactionItem>;

      if (resolvedPolicy === null) {
        const result = await this.requestNativePageWithFallback(options);
        page = result.page;
        resolvedPolicy = result.resolvedPolicy;
      } else {
        page = await this.requestNativePage(options, resolvedPolicy);
      }

      if (page.items.length === 0) {
        break;
      }

      this.collectNativeItems(page.items, address, results, targetItemsCount);

      if (page.nextFingerprint === null) {
        break;
      }

      fingerprint = page.nextFingerprint;
      requestCount += 1;
    }

    return results.slice(0, targetItemsCount);
  }

  private collectNativeItems(
    items: readonly ITronGridNativeTransactionItem[],
    address: string,
    results: IHistoryItemDto[],
    targetItemsCount: number,
  ): void {
    for (const item of items) {
      const mappedItem: IHistoryItemDto | null = this.mapper.mapNativeTransaction(item, address);

      if (mappedItem !== null) {
        results.push(mappedItem);
      }

      if (results.length >= targetItemsCount) {
        break;
      }
    }
  }

  private async loadTrc20Transactions(
    address: string,
    targetItemsCount: number,
  ): Promise<readonly IHistoryItemDto[]> {
    const results: IHistoryItemDto[] = [];
    let fingerprint: string | null = null;
    let requestCount: number = 0;
    let resolvedPolicy: ITronGridRequestQueryPolicy | null = null;
    const pageSize: number = Math.min(TRON_MAX_PAGE_SIZE, targetItemsCount);

    while (results.length < targetItemsCount && requestCount < TRON_MAX_PAGE_REQUESTS) {
      const options: ITronGridPageRequestOptions = {
        path: `/v1/accounts/${address}/transactions/trc20`,
        pageSize,
        fingerprint,
      };

      let page: ITronGridPageLoadResult<ITronGridTrc20TransactionItem>;

      if (resolvedPolicy === null) {
        const result = await this.requestTrc20PageWithFallback(options);
        page = result.page;
        resolvedPolicy = result.resolvedPolicy;
      } else {
        page = await this.requestTrc20Page(options, resolvedPolicy);
      }

      if (page.items.length === 0) {
        break;
      }

      this.collectTrc20Items(page.items, address, results, targetItemsCount);

      if (page.nextFingerprint === null) {
        break;
      }

      fingerprint = page.nextFingerprint;
      requestCount += 1;
    }

    return results.slice(0, targetItemsCount);
  }

  private collectTrc20Items(
    items: readonly ITronGridTrc20TransactionItem[],
    address: string,
    results: IHistoryItemDto[],
    targetItemsCount: number,
  ): void {
    for (const item of items) {
      const mappedItem: IHistoryItemDto | null = this.mapper.mapTrc20Transaction(item, address);

      if (mappedItem !== null) {
        results.push(mappedItem);
      }

      if (results.length >= targetItemsCount) {
        break;
      }
    }
  }

  private async requestNativePageWithFallback(options: ITronGridPageRequestOptions): Promise<{
    readonly page: ITronGridPageLoadResult<ITronGridNativeTransactionItem>;
    readonly resolvedPolicy: ITronGridRequestQueryPolicy;
  }> {
    const fallbackResult: ITronGridFallbackResult = await this.requestPageWithFallback(options);

    return {
      page: this.parseNativePagePayload(fallbackResult.payload),
      resolvedPolicy: fallbackResult.resolvedPolicy,
    };
  }

  private async requestNativePage(
    options: ITronGridPageRequestOptions,
    queryPolicy: ITronGridRequestQueryPolicy,
  ): Promise<ITronGridPageLoadResult<ITronGridNativeTransactionItem>> {
    const payload: ITronGridListResponse<unknown> = await this.requestPage(options, queryPolicy);

    return this.parseNativePagePayload(payload);
  }

  private parseNativePagePayload(
    payload: ITronGridListResponse<unknown>,
  ): ITronGridPageLoadResult<ITronGridNativeTransactionItem> {
    const rawItems: readonly unknown[] = this.resolveResponseData(payload);
    const parsedItems: ITronGridNativeTransactionItem[] = rawItems
      .map((item: unknown): ITronGridNativeTransactionItem | null =>
        this.mapper.parseNativeTransactionItem(item),
      )
      .filter(
        (
          parsedItem: ITronGridNativeTransactionItem | null,
        ): parsedItem is ITronGridNativeTransactionItem => parsedItem !== null,
      );

    return {
      items: parsedItems,
      nextFingerprint: this.resolveNextFingerprint(payload),
    };
  }

  private async requestTrc20PageWithFallback(options: ITronGridPageRequestOptions): Promise<{
    readonly page: ITronGridPageLoadResult<ITronGridTrc20TransactionItem>;
    readonly resolvedPolicy: ITronGridRequestQueryPolicy;
  }> {
    const fallbackResult: ITronGridFallbackResult = await this.requestPageWithFallback(options);

    return {
      page: this.parseTrc20PagePayload(fallbackResult.payload),
      resolvedPolicy: fallbackResult.resolvedPolicy,
    };
  }

  private async requestTrc20Page(
    options: ITronGridPageRequestOptions,
    queryPolicy: ITronGridRequestQueryPolicy,
  ): Promise<ITronGridPageLoadResult<ITronGridTrc20TransactionItem>> {
    const payload: ITronGridListResponse<unknown> = await this.requestPage(options, queryPolicy);

    return this.parseTrc20PagePayload(payload);
  }

  private parseTrc20PagePayload(
    payload: ITronGridListResponse<unknown>,
  ): ITronGridPageLoadResult<ITronGridTrc20TransactionItem> {
    const rawItems: readonly unknown[] = this.resolveResponseData(payload);
    const parsedItems: ITronGridTrc20TransactionItem[] = rawItems
      .map((item: unknown): ITronGridTrc20TransactionItem | null =>
        this.mapper.parseTrc20TransactionItem(item),
      )
      .filter(
        (
          parsedItem: ITronGridTrc20TransactionItem | null,
        ): parsedItem is ITronGridTrc20TransactionItem => parsedItem !== null,
      );

    return {
      items: parsedItems,
      nextFingerprint: this.resolveNextFingerprint(payload),
    };
  }

  private async requestPageWithFallback(
    options: ITronGridPageRequestOptions,
  ): Promise<ITronGridFallbackResult> {
    let lastError: Error | null = null;

    for (const queryPolicy of QUERY_POLICIES) {
      try {
        const payload: ITronGridListResponse<unknown> = await this.requestPage(
          options,
          queryPolicy,
        );

        return { payload, resolvedPolicy: queryPolicy };
      } catch (error: unknown) {
        if (!(error instanceof TronGridBadRequestError)) {
          throw error;
        }

        lastError = error;
        this.warnWithCooldown(
          `history_http_400:${options.path}:${String(queryPolicy.includeOnlyConfirmed)}:${String(queryPolicy.includeOrderBy)}`,
          `[TRON] history HTTP 400 retry with next query policy` +
            ` onlyConfirmed=${String(queryPolicy.includeOnlyConfirmed)}` +
            ` orderBy=${String(queryPolicy.includeOrderBy)}`,
        );
      }
    }

    throw lastError ?? new Error('TRON history request failed without response details.');
  }

  private async requestPage(
    options: ITronGridPageRequestOptions,
    queryPolicy: ITronGridRequestQueryPolicy,
  ): Promise<ITronGridListResponse<unknown>> {
    const headers: Record<string, string> = {};

    if (this.appConfigService.tronGridApiKey !== null) {
      headers['TRON-PRO-API-KEY'] = this.appConfigService.tronGridApiKey;
    }

    const requestUrl: URL = this.buildRequestUrl(options, queryPolicy);
    const limiterKey: LimiterKey = resolveTronHistoryLimiterKey(
      this.appConfigService.tronGridApiKey,
      requestUrl.hostname.toLowerCase(),
    );
    this.logger.debug(`tron history request url=${requestUrl.toString()}`);

    const response: Response = await this.rateLimiterService.schedule(
      limiterKey,
      async (): Promise<Response> =>
        fetch(requestUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(TRON_HISTORY_REQUEST_TIMEOUT_MS),
        }),
      RequestPriority.NORMAL,
    );

    if (response.ok) {
      const payload: unknown = await response.json();

      if (!payload || typeof payload !== 'object') {
        throw new Error('TRON history response is not an object.');
      }

      return payload as ITronGridListResponse<unknown>;
    }

    const responseDetails: string = await this.readResponseDetails(response);
    const errorMessage: string =
      `TRON history HTTP ${response.status}` +
      (responseDetails.length > 0 ? `: ${responseDetails}` : '');

    if (response.status === HTTP_STATUS_BAD_REQUEST) {
      throw new TronGridBadRequestError(errorMessage);
    }

    if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS && this.metricsService !== null) {
      this.metricsService.historyHttp429Total.inc({
        chain: ChainKey.TRON_MAINNET,
        adapter: 'tron_grid_history',
      });
      this.warnWithCooldown(
        `history_http_429:${requestUrl.origin}:${options.path}`,
        `history_http_429 chain=${ChainKey.TRON_MAINNET} adapter=tron_grid_history endpoint=${requestUrl.origin} path=${options.path}`,
      );
    }

    throw new Error(errorMessage);
  }

  private buildRequestUrl(
    options: ITronGridPageRequestOptions,
    queryPolicy: ITronGridRequestQueryPolicy,
  ): URL {
    const requestUrl: URL = new URL(options.path, this.appConfigService.tronGridApiBaseUrl);
    requestUrl.searchParams.set('limit', String(options.pageSize));

    if (queryPolicy.includeOnlyConfirmed) {
      requestUrl.searchParams.set('only_confirmed', 'true');
    }

    if (queryPolicy.includeOrderBy) {
      requestUrl.searchParams.set('order_by', 'block_timestamp,desc');
    }

    if (options.fingerprint !== null) {
      requestUrl.searchParams.set('fingerprint', options.fingerprint);
    }

    return requestUrl;
  }

  private async readResponseDetails(response: Response): Promise<string> {
    try {
      const responseText: string = (await response.text()).trim();

      if (responseText.length === 0) {
        return '';
      }

      const normalizedResponseText: string = responseText.replace(/\s+/g, ' ');
      return normalizedResponseText.slice(0, RESPONSE_PREVIEW_MAX_LENGTH);
    } catch {
      return '';
    }
  }

  private resolveResponseData(payload: ITronGridListResponse<unknown>): readonly unknown[] {
    if (!Array.isArray(payload.data)) {
      throw new Error('TRON history response payload has invalid data field.');
    }

    return payload.data;
  }

  private resolveNextFingerprint(payload: ITronGridListResponse<unknown>): string | null {
    const directFingerprint: string | null = this.normalizeString(payload.meta?.fingerprint);

    if (directFingerprint !== null) {
      return directFingerprint;
    }

    const nextLink: string | null = this.normalizeString(payload.meta?.links?.next);

    if (nextLink === null) {
      return null;
    }

    try {
      const nextUrl: URL = new URL(nextLink);
      const nextFingerprint: string | null = nextUrl.searchParams.get('fingerprint');

      if (nextFingerprint === null || nextFingerprint.trim().length === 0) {
        return null;
      }

      return nextFingerprint.trim();
    } catch {
      return null;
    }
  }

  private normalizeString(rawValue: unknown): string | null {
    if (typeof rawValue !== 'string') {
      return null;
    }

    const normalizedValue: string = rawValue.trim();

    if (normalizedValue.length === 0) {
      return null;
    }

    return normalizedValue;
  }

  private warnWithCooldown(key: string, message: string): void {
    if (!this.warningEmitter.shouldEmit(key)) {
      return;
    }
    this.logger.warn(message);
  }
}
