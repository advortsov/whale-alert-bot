import { Injectable, Logger } from '@nestjs/common';

import type {
  ITronGridListResponse,
  ITronGridNativeTransactionItem,
  ITronGridTrc20TransactionItem,
} from './tron-grid-history.interfaces';
import { TronGridHistoryMapper } from './tron-grid-history.mapper';
import { AppConfigService } from '../../../config/app-config.service';
import { ChainKey } from '../../../core/chains/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../core/ports/explorers/history-explorer.interfaces';
import {
  type IHistoryItemDto,
  type IHistoryPageDto,
} from '../../../features/tracking/dto/history-item.dto';
import {
  HistoryKind,
  type IHistoryRequestDto,
} from '../../../features/tracking/dto/history-request.dto';
import { TronAddressCodec } from '../../address/tron/tron-address.codec';

interface ITronGridPageRequestOptions {
  readonly path: string;
  readonly pageSize: number;
  readonly fingerprint: string | null;
}

interface ITronGridPageLoadResult<TItem> {
  readonly items: readonly TItem[];
  readonly nextFingerprint: string | null;
}

interface ITronGridRequestQueryPolicy {
  readonly includeOnlyConfirmed: boolean;
  readonly includeOrderBy: boolean;
}

const TRON_HISTORY_REQUEST_TIMEOUT_MS = 10_000;
const TRON_MAX_PAGE_SIZE = 200;
const TRON_MAX_PAGE_REQUESTS = 20;
const HTTP_STATUS_BAD_REQUEST = 400;
const RESPONSE_PREVIEW_MAX_LENGTH = 300;

const QUERY_POLICIES: readonly ITronGridRequestQueryPolicy[] = [
  {
    includeOnlyConfirmed: true,
    includeOrderBy: true,
  },
  {
    includeOnlyConfirmed: true,
    includeOrderBy: false,
  },
  {
    includeOnlyConfirmed: false,
    includeOrderBy: false,
  },
];

@Injectable()
export class TronGridHistoryAdapter implements IHistoryExplorerAdapter {
  private readonly logger: Logger = new Logger(TronGridHistoryAdapter.name);
  private readonly mapper: TronGridHistoryMapper;

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly tronAddressCodec: TronAddressCodec,
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

    while (results.length < targetItemsCount && requestCount < TRON_MAX_PAGE_REQUESTS) {
      const pageSize: number = this.resolvePageSize(targetItemsCount, results.length);
      const page: ITronGridPageLoadResult<ITronGridNativeTransactionItem> =
        await this.requestNativePage({
          path: `/v1/accounts/${address}/transactions`,
          pageSize,
          fingerprint,
        });

      if (page.items.length === 0) {
        break;
      }

      for (const item of page.items) {
        const mappedItem: IHistoryItemDto | null = this.mapper.mapNativeTransaction(item, address);

        if (mappedItem !== null) {
          results.push(mappedItem);
        }

        if (results.length >= targetItemsCount) {
          break;
        }
      }

      if (page.nextFingerprint === null) {
        break;
      }

      fingerprint = page.nextFingerprint;
      requestCount += 1;
    }

    return results.slice(0, targetItemsCount);
  }

  private async loadTrc20Transactions(
    address: string,
    targetItemsCount: number,
  ): Promise<readonly IHistoryItemDto[]> {
    const results: IHistoryItemDto[] = [];
    let fingerprint: string | null = null;
    let requestCount: number = 0;

    while (results.length < targetItemsCount && requestCount < TRON_MAX_PAGE_REQUESTS) {
      const pageSize: number = this.resolvePageSize(targetItemsCount, results.length);
      const page: ITronGridPageLoadResult<ITronGridTrc20TransactionItem> =
        await this.requestTrc20Page({
          path: `/v1/accounts/${address}/transactions/trc20`,
          pageSize,
          fingerprint,
        });

      if (page.items.length === 0) {
        break;
      }

      for (const item of page.items) {
        const mappedItem: IHistoryItemDto | null = this.mapper.mapTrc20Transaction(item, address);

        if (mappedItem !== null) {
          results.push(mappedItem);
        }

        if (results.length >= targetItemsCount) {
          break;
        }
      }

      if (page.nextFingerprint === null) {
        break;
      }

      fingerprint = page.nextFingerprint;
      requestCount += 1;
    }

    return results.slice(0, targetItemsCount);
  }

  private resolvePageSize(targetItemsCount: number, currentItemsCount: number): number {
    return Math.min(TRON_MAX_PAGE_SIZE, Math.max(targetItemsCount - currentItemsCount, 1));
  }

  private async requestNativePage(
    options: ITronGridPageRequestOptions,
  ): Promise<ITronGridPageLoadResult<ITronGridNativeTransactionItem>> {
    const payload: ITronGridListResponse<unknown> = await this.requestPage(options);
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

  private async requestTrc20Page(
    options: ITronGridPageRequestOptions,
  ): Promise<ITronGridPageLoadResult<ITronGridTrc20TransactionItem>> {
    const payload: ITronGridListResponse<unknown> = await this.requestPage(options);
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

  private async requestPage(
    options: ITronGridPageRequestOptions,
  ): Promise<ITronGridListResponse<unknown>> {
    const headers: Record<string, string> = {};

    if (this.appConfigService.tronGridApiKey !== null) {
      headers['TRON-PRO-API-KEY'] = this.appConfigService.tronGridApiKey;
    }

    let lastError: Error | null = null;

    for (const queryPolicy of QUERY_POLICIES) {
      const requestUrl: URL = this.buildRequestUrl(options, queryPolicy);
      this.logger.debug(`tron history request url=${requestUrl.toString()}`);

      const response: Response = await fetch(requestUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(TRON_HISTORY_REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        const payload: unknown = await response.json();

        if (!payload || typeof payload !== 'object') {
          throw new Error('TRON history response is not an object.');
        }

        return payload as ITronGridListResponse<unknown>;
      }

      const responseDetails: string = await this.readResponseDetails(response);
      lastError = new Error(
        `TRON history HTTP ${response.status}${responseDetails.length > 0 ? `: ${responseDetails}` : ''}`,
      );

      if (response.status !== HTTP_STATUS_BAD_REQUEST) {
        throw lastError;
      }

      this.logger.warn(
        `tron history HTTP 400, retry with fallback query policy onlyConfirmed=${String(queryPolicy.includeOnlyConfirmed)} orderBy=${String(queryPolicy.includeOrderBy)}`,
      );
    }

    throw lastError ?? new Error('TRON history request failed without response details.');
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
}
