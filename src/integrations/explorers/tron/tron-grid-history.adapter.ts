import { Injectable, Logger } from '@nestjs/common';

import type {
  TronGridListResponse,
  TronGridNativeContractItem,
  TronGridNativeRetItem,
  TronGridNativeTransactionItem,
  TronGridTrc20TokenInfo,
  TronGridTrc20TransactionItem,
} from './tron-grid-history.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { ChainKey } from '../../../core/chains/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../core/ports/explorers/history-explorer.interfaces';
import {
  HistoryDirection,
  HistoryItemType,
  type HistoryItemDto,
  type HistoryPageDto,
} from '../../../features/tracking/dto/history-item.dto';
import {
  HistoryDirectionFilter,
  HistoryKind,
  type HistoryRequestDto,
} from '../../../features/tracking/dto/history-request.dto';
import { TronAddressCodec } from '../../address/tron/tron-address.codec';

interface TronGridPageRequestOptions {
  readonly path: string;
  readonly pageSize: number;
  readonly fingerprint: string | null;
}

interface TronGridPageLoadResult<TItem> {
  readonly items: readonly TItem[];
  readonly nextFingerprint: string | null;
}

@Injectable()
export class TronGridHistoryAdapter implements IHistoryExplorerAdapter {
  private static readonly REQUEST_TIMEOUT_MS: number = 10_000;
  private static readonly MAX_PAGE_SIZE: number = 200;
  private static readonly MAX_PAGE_REQUESTS: number = 20;

  private readonly logger: Logger = new Logger(TronGridHistoryAdapter.name);

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly tronAddressCodec: TronAddressCodec,
  ) {}

  public async loadRecentTransactions(request: HistoryRequestDto): Promise<HistoryPageDto> {
    if (request.chainKey !== ChainKey.TRON_MAINNET) {
      throw new Error(`TRON history adapter does not support chain ${request.chainKey}.`);
    }

    const targetItemsCount: number = request.offset + request.limit + 1;
    const nativeItems: readonly HistoryItemDto[] =
      request.kind === HistoryKind.ERC20
        ? []
        : await this.loadNativeTransactions(request.address, targetItemsCount);
    const tokenItems: readonly HistoryItemDto[] =
      request.kind === HistoryKind.ETH
        ? []
        : await this.loadTrc20Transactions(request.address, targetItemsCount);
    const mergedItems: HistoryItemDto[] = [...nativeItems, ...tokenItems];
    mergedItems.sort(
      (leftItem: HistoryItemDto, rightItem: HistoryItemDto): number =>
        rightItem.timestampSec - leftItem.timestampSec,
    );

    const filteredItems: readonly HistoryItemDto[] = this.applyDirectionFilter(
      mergedItems,
      request.direction,
    );
    const pagedItems: readonly HistoryItemDto[] = filteredItems.slice(
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
  ): Promise<readonly HistoryItemDto[]> {
    const results: HistoryItemDto[] = [];
    let fingerprint: string | null = null;
    let requestCount: number = 0;

    while (
      results.length < targetItemsCount &&
      requestCount < TronGridHistoryAdapter.MAX_PAGE_REQUESTS
    ) {
      const pageSize: number = this.resolvePageSize(targetItemsCount, results.length);
      const page: TronGridPageLoadResult<TronGridNativeTransactionItem> =
        await this.requestNativePage({
          path: `/v1/accounts/${address}/transactions`,
          pageSize,
          fingerprint,
        });

      if (page.items.length === 0) {
        break;
      }

      for (const item of page.items) {
        const mappedItem: HistoryItemDto | null = this.mapNativeTransaction(item, address);

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
  ): Promise<readonly HistoryItemDto[]> {
    const results: HistoryItemDto[] = [];
    let fingerprint: string | null = null;
    let requestCount: number = 0;

    while (
      results.length < targetItemsCount &&
      requestCount < TronGridHistoryAdapter.MAX_PAGE_REQUESTS
    ) {
      const pageSize: number = this.resolvePageSize(targetItemsCount, results.length);
      const page: TronGridPageLoadResult<TronGridTrc20TransactionItem> =
        await this.requestTrc20Page({
          path: `/v1/accounts/${address}/transactions/trc20`,
          pageSize,
          fingerprint,
        });

      if (page.items.length === 0) {
        break;
      }

      for (const item of page.items) {
        const mappedItem: HistoryItemDto | null = this.mapTrc20Transaction(item, address);

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
    return Math.min(
      TronGridHistoryAdapter.MAX_PAGE_SIZE,
      Math.max(targetItemsCount - currentItemsCount, 1),
    );
  }

  private async requestNativePage(
    options: TronGridPageRequestOptions,
  ): Promise<TronGridPageLoadResult<TronGridNativeTransactionItem>> {
    const payload: TronGridListResponse<unknown> = await this.requestPage(options);
    const rawItems: readonly unknown[] = this.resolveResponseData(payload);
    const parsedItems: TronGridNativeTransactionItem[] = rawItems
      .map((item: unknown): TronGridNativeTransactionItem | null =>
        this.parseNativeTransactionItem(item),
      )
      .filter(
        (
          parsedItem: TronGridNativeTransactionItem | null,
        ): parsedItem is TronGridNativeTransactionItem => parsedItem !== null,
      );

    return {
      items: parsedItems,
      nextFingerprint: this.resolveNextFingerprint(payload),
    };
  }

  private async requestTrc20Page(
    options: TronGridPageRequestOptions,
  ): Promise<TronGridPageLoadResult<TronGridTrc20TransactionItem>> {
    const payload: TronGridListResponse<unknown> = await this.requestPage(options);
    const rawItems: readonly unknown[] = this.resolveResponseData(payload);
    const parsedItems: TronGridTrc20TransactionItem[] = rawItems
      .map((item: unknown): TronGridTrc20TransactionItem | null =>
        this.parseTrc20TransactionItem(item),
      )
      .filter(
        (
          parsedItem: TronGridTrc20TransactionItem | null,
        ): parsedItem is TronGridTrc20TransactionItem => parsedItem !== null,
      );

    return {
      items: parsedItems,
      nextFingerprint: this.resolveNextFingerprint(payload),
    };
  }

  private async requestPage(
    options: TronGridPageRequestOptions,
  ): Promise<TronGridListResponse<unknown>> {
    const requestUrl: URL = new URL(options.path, this.appConfigService.tronGridApiBaseUrl);
    requestUrl.searchParams.set('only_confirmed', 'true');
    requestUrl.searchParams.set('order_by', 'block_timestamp,desc');
    requestUrl.searchParams.set('limit', String(options.pageSize));

    if (options.fingerprint !== null) {
      requestUrl.searchParams.set('fingerprint', options.fingerprint);
    }

    const headers: Record<string, string> = {};

    if (this.appConfigService.tronGridApiKey !== null) {
      headers['TRON-PRO-API-KEY'] = this.appConfigService.tronGridApiKey;
    }

    this.logger.debug(`tron history request url=${requestUrl.toString()}`);

    const response: Response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(TronGridHistoryAdapter.REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`TRON history HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();

    if (!payload || typeof payload !== 'object') {
      throw new Error('TRON history response is not an object.');
    }

    return payload as TronGridListResponse<unknown>;
  }

  private resolveResponseData(payload: TronGridListResponse<unknown>): readonly unknown[] {
    if (!Array.isArray(payload.data)) {
      throw new Error('TRON history response payload has invalid data field.');
    }

    return payload.data;
  }

  private resolveNextFingerprint(payload: TronGridListResponse<unknown>): string | null {
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

  private parseNativeTransactionItem(value: unknown): TronGridNativeTransactionItem | null {
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

    const contracts: TronGridNativeContractItem[] = contractRaw
      .map((contractItem: unknown): TronGridNativeContractItem | null =>
        this.parseNativeContractItem(contractItem),
      )
      .filter(
        (
          contractItem: TronGridNativeContractItem | null,
        ): contractItem is TronGridNativeContractItem => contractItem !== null,
      );
    const retRaw: unknown = record['ret'];
    const ret: readonly TronGridNativeRetItem[] | undefined = this.parseRetItems(retRaw);

    return {
      txID: txId,
      block_timestamp: blockTimestamp,
      raw_data: {
        contract: contracts,
      },
      ret,
    };
  }

  private parseNativeContractItem(value: unknown): TronGridNativeContractItem | null {
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

  private parseRetItems(value: unknown): readonly TronGridNativeRetItem[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value
      .map((retValue: unknown): TronGridNativeRetItem | null => {
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
        (retItem: TronGridNativeRetItem | null): retItem is TronGridNativeRetItem =>
          retItem !== null,
      );
  }

  private parseTrc20TransactionItem(value: unknown): TronGridTrc20TransactionItem | null {
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

  private parseTokenInfo(value: unknown): TronGridTrc20TokenInfo | undefined {
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
    item: TronGridNativeTransactionItem,
    trackedAddress: string,
  ): HistoryItemDto | null {
    const txHash: string | null = this.normalizeString(item.txID);
    const blockTimestampMs: number | null = this.normalizeTimestampMs(item.block_timestamp);
    const contract: TronGridNativeContractItem | null = this.resolvePrimaryContract(item);

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
      assetDecimals: 6,
      eventType: HistoryItemType.TRANSFER,
      direction: this.resolveDirection(trackedAddress, fromAddress, toAddress),
      txLink: `${this.appConfigService.tronscanTxBaseUrl}${txHash}`,
    };
  }

  private mapTrc20Transaction(
    item: TronGridTrc20TransactionItem,
    trackedAddress: string,
  ): HistoryItemDto | null {
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
    item: TronGridNativeTransactionItem,
  ): TronGridNativeContractItem | null {
    const contracts: readonly TronGridNativeContractItem[] | undefined = item.raw_data?.contract;

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

  private resolveIsError(retItems: readonly TronGridNativeRetItem[] | undefined): boolean {
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
    items: readonly HistoryItemDto[],
    directionFilter: HistoryDirectionFilter,
  ): readonly HistoryItemDto[] {
    if (directionFilter === HistoryDirectionFilter.ALL) {
      return items;
    }

    const targetDirection: HistoryDirection =
      directionFilter === HistoryDirectionFilter.IN ? HistoryDirection.IN : HistoryDirection.OUT;

    return items.filter((item: HistoryItemDto): boolean => item.direction === targetDirection);
  }
}
