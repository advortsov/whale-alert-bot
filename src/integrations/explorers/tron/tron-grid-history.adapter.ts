import { Injectable, Logger } from '@nestjs/common';

import type {
  ITronGridListResponse,
  ITronGridNativeContractItem,
  ITronGridNativeRetItem,
  ITronGridNativeTransactionItem,
  ITronGridTrc20TokenInfo,
  ITronGridTrc20TransactionItem,
} from './tron-grid-history.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { ChainKey } from '../../../core/chains/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../core/ports/explorers/history-explorer.interfaces';
import {
  HistoryDirection,
  HistoryItemType,
  type IHistoryItemDto,
  type IHistoryPageDto,
} from '../../../features/tracking/dto/history-item.dto';
import {
  HistoryDirectionFilter,
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
const TRX_NATIVE_DECIMALS = 6;

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

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly tronAddressCodec: TronAddressCodec,
  ) {}

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

    const filteredItems: readonly IHistoryItemDto[] = this.applyDirectionFilter(
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
        const mappedItem: IHistoryItemDto | null = this.mapNativeTransaction(item, address);

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
        const mappedItem: IHistoryItemDto | null = this.mapTrc20Transaction(item, address);

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
        this.parseNativeTransactionItem(item),
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
        this.parseTrc20TransactionItem(item),
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

  private parseNativeTransactionItem(value: unknown): ITronGridNativeTransactionItem | null {
    const record: Record<string, unknown> | null = this.parseRecord(value);

    if (record === null) {
      return null;
    }

    const txId: string | null = this.normalizeString(record['txID']);
    const blockTimestamp: number | null = this.normalizeTimestampMs(record['block_timestamp']);
    const rawDataRecord: Record<string, unknown> | null = this.parseRecord(record['raw_data']);
    const contractRaw: unknown = rawDataRecord?.['contract'];

    if (txId === null || blockTimestamp === null || !Array.isArray(contractRaw)) {
      return null;
    }

    const contracts: ITronGridNativeContractItem[] = contractRaw
      .map((contractItem: unknown): ITronGridNativeContractItem | null =>
        this.parseNativeContractItem(contractItem),
      )
      .filter(
        (
          contractItem: ITronGridNativeContractItem | null,
        ): contractItem is ITronGridNativeContractItem => contractItem !== null,
      );
    const retRaw: unknown = record['ret'];
    const ret: readonly ITronGridNativeRetItem[] | undefined = this.parseRetItems(retRaw);

    return {
      txID: txId,
      block_timestamp: blockTimestamp,
      raw_data: {
        contract: contracts,
      },
      ret,
    };
  }

  private parseNativeContractItem(value: unknown): ITronGridNativeContractItem | null {
    const record: Record<string, unknown> | null = this.parseRecord(value);

    if (record === null) {
      return null;
    }

    const contractType: string | null = this.normalizeString(record['type']);
    const parameterRecord: Record<string, unknown> | null = this.parseRecord(record['parameter']);
    const valueRecord: Record<string, unknown> | null = this.parseRecord(
      parameterRecord?.['value'],
    );

    if (contractType === null || valueRecord === null) {
      return null;
    }

    return {
      type: contractType,
      parameter: {
        value: {
          owner_address: this.normalizeString(valueRecord['owner_address']) ?? undefined,
          to_address: this.normalizeString(valueRecord['to_address']) ?? undefined,
          contract_address: this.normalizeString(valueRecord['contract_address']) ?? undefined,
          amount: this.normalizeUnsignedValue(valueRecord['amount']) ?? undefined,
          call_value: this.normalizeUnsignedValue(valueRecord['call_value']) ?? undefined,
        },
      },
    };
  }

  private parseRetItems(value: unknown): readonly ITronGridNativeRetItem[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .map((retValue: unknown): ITronGridNativeRetItem | null => {
        const retRecord: Record<string, unknown> | null = this.parseRecord(retValue);

        if (retRecord === null) {
          return null;
        }

        const contractRet: string | null = this.normalizeString(retRecord['contractRet']);

        if (contractRet === null) {
          return null;
        }

        return {
          contractRet,
        };
      })
      .filter(
        (retItem: ITronGridNativeRetItem | null): retItem is ITronGridNativeRetItem =>
          retItem !== null,
      );
  }

  private parseTrc20TransactionItem(value: unknown): ITronGridTrc20TransactionItem | null {
    const record: Record<string, unknown> | null = this.parseRecord(value);

    if (record === null) {
      return null;
    }

    const txId: string | null = this.normalizeString(record['transaction_id']);
    const blockTimestamp: number | null = this.normalizeTimestampMs(record['block_timestamp']);

    if (txId === null || blockTimestamp === null) {
      return null;
    }

    return {
      transaction_id: txId,
      block_timestamp: blockTimestamp,
      from: this.normalizeString(record['from']) ?? undefined,
      to: this.normalizeString(record['to']) ?? undefined,
      value: this.normalizeUnsignedValue(record['value']) ?? undefined,
      token_info: this.parseTokenInfo(record['token_info']),
    };
  }

  private parseTokenInfo(value: unknown): ITronGridTrc20TokenInfo | undefined {
    const record: Record<string, unknown> | null = this.parseRecord(value);

    if (record === null) {
      return undefined;
    }

    return {
      symbol: this.normalizeString(record['symbol']) ?? undefined,
      decimals: this.normalizeTokenDecimals(record['decimals']),
    };
  }

  private mapNativeTransaction(
    item: ITronGridNativeTransactionItem,
    trackedAddress: string,
  ): IHistoryItemDto | null {
    const txHash: string | null = this.normalizeString(item.txID);
    const blockTimestampMs: number | null = this.normalizeTimestampMs(item.block_timestamp);
    const contract: ITronGridNativeContractItem | null = this.resolvePrimaryContract(item);

    if (txHash === null || blockTimestampMs === null || contract === null) {
      return null;
    }

    const contractType: string = this.normalizeString(contract.type) ?? '';
    const fromAddress: string = this.normalizeTronAddress(contract.parameter?.value?.owner_address);
    const toAddress: string =
      contractType === 'TransferContract'
        ? this.normalizeTronAddress(contract.parameter?.value?.to_address)
        : this.normalizeTronAddress(contract.parameter?.value?.contract_address);
    const amountRawFromTransfer: string | null = this.normalizeUnsignedValue(
      contract.parameter?.value?.amount,
    );
    const amountRawFromCall: string | null = this.normalizeUnsignedValue(
      contract.parameter?.value?.call_value,
    );
    const txValueRaw: string = amountRawFromTransfer ?? amountRawFromCall ?? '0';

    if (
      contractType !== 'TransferContract' &&
      (amountRawFromCall === null || amountRawFromCall === '0')
    ) {
      return null;
    }

    return {
      txHash,
      timestampSec: Math.floor(blockTimestampMs / 1000),
      from: fromAddress,
      to: toAddress,
      valueRaw: txValueRaw,
      isError: this.resolveIsError(item.ret),
      assetSymbol: 'TRX',
      assetDecimals: TRX_NATIVE_DECIMALS,
      eventType: HistoryItemType.TRANSFER,
      direction: this.resolveDirection(trackedAddress, fromAddress, toAddress),
      txLink: `${this.appConfigService.tronscanTxBaseUrl}${txHash}`,
    };
  }

  private mapTrc20Transaction(
    item: ITronGridTrc20TransactionItem,
    trackedAddress: string,
  ): IHistoryItemDto | null {
    const txHash: string | null = this.normalizeString(item.transaction_id);
    const blockTimestampMs: number | null = this.normalizeTimestampMs(item.block_timestamp);

    if (txHash === null || blockTimestampMs === null) {
      return null;
    }

    const fromAddress: string = this.normalizeTronAddress(item.from);
    const toAddress: string = this.normalizeTronAddress(item.to);
    const valueRaw: string = this.normalizeUnsignedValue(item.value) ?? '0';
    const symbol: string = this.normalizeString(item.token_info?.symbol) ?? 'TRC20';
    const decimals: number = this.normalizeTokenDecimals(item.token_info?.decimals);

    return {
      txHash,
      timestampSec: Math.floor(blockTimestampMs / 1000),
      from: fromAddress,
      to: toAddress,
      valueRaw,
      isError: false,
      assetSymbol: symbol,
      assetDecimals: decimals,
      eventType: HistoryItemType.TRANSFER,
      direction: this.resolveDirection(trackedAddress, fromAddress, toAddress),
      txLink: `${this.appConfigService.tronscanTxBaseUrl}${txHash}`,
    };
  }

  private resolvePrimaryContract(
    item: ITronGridNativeTransactionItem,
  ): ITronGridNativeContractItem | null {
    const contracts: readonly ITronGridNativeContractItem[] | undefined = item.raw_data?.contract;

    if (!contracts || contracts.length === 0) {
      return null;
    }

    return contracts[0] ?? null;
  }

  private resolveDirection(
    trackedAddress: string,
    fromAddress: string,
    toAddress: string,
  ): HistoryDirection {
    const normalizedTrackedAddress: string | null = this.tronAddressCodec.normalize(trackedAddress);
    const normalizedFrom: string | null = this.tronAddressCodec.normalize(fromAddress);
    const normalizedTo: string | null = this.tronAddressCodec.normalize(toAddress);

    if (normalizedTrackedAddress === null) {
      return HistoryDirection.UNKNOWN;
    }

    if (normalizedFrom === normalizedTrackedAddress && normalizedTo !== normalizedTrackedAddress) {
      return HistoryDirection.OUT;
    }

    if (normalizedTo === normalizedTrackedAddress && normalizedFrom !== normalizedTrackedAddress) {
      return HistoryDirection.IN;
    }

    return HistoryDirection.UNKNOWN;
  }

  private resolveIsError(retItems: readonly ITronGridNativeRetItem[] | undefined): boolean {
    if (!retItems || retItems.length === 0) {
      return false;
    }

    for (const retItem of retItems) {
      const contractRet: string | null = this.normalizeString(retItem.contractRet);

      if (contractRet !== null && contractRet !== 'SUCCESS') {
        return true;
      }
    }

    return false;
  }

  private normalizeTronAddress(rawAddress: string | undefined): string {
    if (typeof rawAddress !== 'string') {
      return 'unknown';
    }

    return this.tronAddressCodec.normalize(rawAddress) ?? rawAddress.trim();
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

  private normalizeTimestampMs(rawValue: unknown): number | null {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue <= 0) {
      return null;
    }

    return Math.floor(rawValue);
  }

  private normalizeUnsignedValue(rawValue: unknown): string | null {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0) {
      return Math.floor(rawValue).toString();
    }

    if (typeof rawValue !== 'string') {
      return null;
    }

    const normalizedValue: string = rawValue.trim();

    if (!/^\d+$/.test(normalizedValue)) {
      return null;
    }

    return normalizedValue;
  }

  private normalizeTokenDecimals(rawValue: unknown): number {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue >= 0) {
      return Math.floor(rawValue);
    }

    if (typeof rawValue === 'string' && /^\d+$/.test(rawValue.trim())) {
      return Number.parseInt(rawValue.trim(), 10);
    }

    return 0;
  }

  private parseRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private applyDirectionFilter(
    items: readonly IHistoryItemDto[],
    directionFilter: HistoryDirectionFilter,
  ): readonly IHistoryItemDto[] {
    if (directionFilter === HistoryDirectionFilter.ALL) {
      return items;
    }

    const targetDirection: HistoryDirection =
      directionFilter === HistoryDirectionFilter.IN ? HistoryDirection.IN : HistoryDirection.OUT;

    return items.filter((item: IHistoryItemDto): boolean => item.direction === targetDirection);
  }
}
