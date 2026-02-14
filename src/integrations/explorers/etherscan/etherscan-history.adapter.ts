import { Injectable, Logger } from '@nestjs/common';

import {
  EtherscanHistoryAction,
  type IEtherscanHistoryResponse,
  type IEtherscanNormalTransaction,
  type IEtherscanTokenTransaction,
} from './etherscan-history.interfaces';
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
import {
  LimiterKey,
  RequestPriority,
} from '../../../rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../../../rate-limiting/bottleneck-rate-limiter.service';

const ETHERSCAN_FETCH_TIMEOUT_MS = 10_000;

@Injectable()
export class EtherscanHistoryAdapter implements IHistoryExplorerAdapter {
  private readonly logger: Logger = new Logger(EtherscanHistoryAdapter.name);

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly rateLimiterService: BottleneckRateLimiterService,
  ) {}

  public async loadRecentTransactions(request: IHistoryRequestDto): Promise<IHistoryPageDto> {
    if (request.chainKey !== ChainKey.ETHEREUM_MAINNET) {
      throw new Error(`Explorer history adapter does not support chain ${request.chainKey}.`);
    }

    const apiKey: string | null = this.appConfigService.etherscanApiKey;

    if (!apiKey) {
      throw new Error('ETHERSCAN_API_KEY is not set. История временно недоступна.');
    }

    this.logger.debug(
      `history request address=${request.address} limit=${String(request.limit)} offset=${String(request.offset)} kind=${request.kind} endpoint=${this.appConfigService.etherscanApiBaseUrl}`,
    );

    const collectedItems: IHistoryItemDto[] = [];

    if (request.kind === HistoryKind.ETH) {
      const ethItems: readonly IHistoryItemDto[] = await this.loadByAction(
        request,
        apiKey,
        EtherscanHistoryAction.TX_LIST,
      );
      collectedItems.push(...ethItems);
    } else if (request.kind === HistoryKind.ERC20) {
      const tokenItems: readonly IHistoryItemDto[] = await this.loadByAction(
        request,
        apiKey,
        EtherscanHistoryAction.TOKEN_TX_LIST,
      );
      collectedItems.push(...tokenItems);
    } else {
      const normalItems: readonly IHistoryItemDto[] = await this.loadByAction(
        request,
        apiKey,
        EtherscanHistoryAction.TX_LIST,
      );

      if (normalItems.length > 0) {
        collectedItems.push(...normalItems);
      } else {
        this.logger.debug(
          `history txlist empty, fallback to tokentx address=${request.address} limit=${String(request.limit)}`,
        );
        const tokenItems: readonly IHistoryItemDto[] = await this.loadByAction(
          request,
          apiKey,
          EtherscanHistoryAction.TOKEN_TX_LIST,
        );
        collectedItems.push(...tokenItems);
      }
    }

    const filteredItems: readonly IHistoryItemDto[] = this.applyDirectionFilter(
      collectedItems,
      request.direction,
    );

    const pagedItems: readonly IHistoryItemDto[] = filteredItems.slice(0, request.limit);

    return {
      items: pagedItems,
      nextOffset: filteredItems.length > request.limit ? request.offset + request.limit : null,
    };
  }

  private async loadByAction(
    request: IHistoryRequestDto,
    apiKey: string,
    action: EtherscanHistoryAction,
  ): Promise<readonly IHistoryItemDto[]> {
    const response: IEtherscanHistoryResponse = await this.requestHistory(request, apiKey, action);

    if (this.isNoTransactionsResponse(response)) {
      return [];
    }

    if (response.status !== '1') {
      throw new Error(`Etherscan API error: ${this.extractApiError(response)}`);
    }

    if (typeof response.result === 'string') {
      return [];
    }

    return response.result.map((value: unknown) =>
      action === EtherscanHistoryAction.TX_LIST
        ? this.mapNormalTransaction(value, request.address)
        : this.mapTokenTransaction(value, request.address),
    );
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

  private async requestHistory(
    request: IHistoryRequestDto,
    apiKey: string,
    action: EtherscanHistoryAction,
  ): Promise<IEtherscanHistoryResponse> {
    const url: URL = new URL(this.appConfigService.etherscanApiBaseUrl);
    url.searchParams.set('chainid', '1');
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', action);
    url.searchParams.set('address', request.address);
    url.searchParams.set('startblock', '0');
    url.searchParams.set('endblock', '99999999');
    url.searchParams.set('page', String(this.resolvePage(request.offset, request.limit)));
    url.searchParams.set('offset', String(request.limit));
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('apikey', apiKey);

    const response: Response = await this.rateLimiterService.schedule(
      LimiterKey.ETHERSCAN,
      async (): Promise<Response> =>
        fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(ETHERSCAN_FETCH_TIMEOUT_MS),
        }),
      RequestPriority.NORMAL,
    );

    if (!response.ok) {
      throw new Error(`Etherscan HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    return this.parseHistoryResponse(payload);
  }

  private resolvePage(offset: number, limit: number): number {
    if (offset <= 0) {
      return 1;
    }

    return Math.floor(offset / limit) + 1;
  }

  private mapNormalTransaction(value: unknown, address: string): IHistoryItemDto {
    const tx: IEtherscanNormalTransaction = this.parseNormalTransaction(value);
    const direction: HistoryDirection =
      tx.from.toLowerCase() === address.toLowerCase() ? HistoryDirection.OUT : HistoryDirection.IN;

    return {
      txHash: tx.hash,
      timestampSec: Number.parseInt(tx.timeStamp, 10),
      from: tx.from,
      to: tx.to,
      valueRaw: tx.value,
      isError: tx.isError !== '0',
      assetSymbol: 'ETH',
      assetDecimals: 18,
      eventType: HistoryItemType.TRANSFER,
      direction,
      txLink: `${this.appConfigService.etherscanTxBaseUrl}${tx.hash}`,
    };
  }

  private mapTokenTransaction(value: unknown, address: string): IHistoryItemDto {
    const tx: IEtherscanTokenTransaction = this.parseTokenTransaction(value);
    const parsedDecimals: number = Number.parseInt(tx.tokenDecimal, 10);
    const tokenDecimals: number = Number.isNaN(parsedDecimals) ? 0 : parsedDecimals;
    const direction: HistoryDirection =
      tx.from.toLowerCase() === address.toLowerCase() ? HistoryDirection.OUT : HistoryDirection.IN;

    return {
      txHash: tx.hash,
      timestampSec: Number.parseInt(tx.timeStamp, 10),
      from: tx.from,
      to: tx.to,
      valueRaw: tx.value,
      isError: tx.isError === '1',
      assetSymbol: tx.tokenSymbol,
      assetDecimals: tokenDecimals,
      eventType: HistoryItemType.TRANSFER,
      direction,
      txLink: `${this.appConfigService.etherscanTxBaseUrl}${tx.hash}`,
    };
  }

  private parseNormalTransaction(value: unknown): IEtherscanNormalTransaction {
    const tx: Record<string, unknown> = this.parseTransactionObject(value);
    const requiredFields: readonly string[] = [
      'hash',
      'timeStamp',
      'from',
      'to',
      'value',
      'isError',
    ];

    for (const field of requiredFields) {
      if (typeof tx[field] !== 'string') {
        throw new Error(`Etherscan normal tx field "${field}" is invalid.`);
      }
    }

    return tx as unknown as IEtherscanNormalTransaction;
  }

  private parseTokenTransaction(value: unknown): IEtherscanTokenTransaction {
    const tx: Record<string, unknown> = this.parseTransactionObject(value);
    const requiredFields: readonly string[] = [
      'hash',
      'timeStamp',
      'from',
      'to',
      'value',
      'tokenSymbol',
      'tokenDecimal',
    ];

    for (const field of requiredFields) {
      if (typeof tx[field] !== 'string') {
        throw new Error(`Etherscan token tx field "${field}" is invalid.`);
      }
    }

    if (tx['isError'] !== undefined && typeof tx['isError'] !== 'string') {
      throw new Error('Etherscan token tx field "isError" is invalid.');
    }

    return tx as unknown as IEtherscanTokenTransaction;
  }

  private parseTransactionObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      throw new Error('Etherscan transaction item is invalid.');
    }

    return value as Record<string, unknown>;
  }

  private isNoTransactionsResponse(response: IEtherscanHistoryResponse): boolean {
    return (
      response.status === '0' &&
      response.message.toLowerCase() === 'no transactions found' &&
      Array.isArray(response.result) &&
      response.result.length === 0
    );
  }

  private extractApiError(response: IEtherscanHistoryResponse): string {
    if (typeof response.result === 'string' && response.result.trim().length > 0) {
      return response.result;
    }

    return response.message;
  }

  private parseHistoryResponse(payload: unknown): IEtherscanHistoryResponse {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Etherscan response is not an object.');
    }

    const value = payload as {
      status?: unknown;
      message?: unknown;
      result?: unknown;
    };

    if (typeof value.status !== 'string' || typeof value.message !== 'string') {
      throw new Error('Etherscan response has invalid status/message.');
    }

    if (!Array.isArray(value.result) && typeof value.result !== 'string') {
      throw new Error('Etherscan response has invalid result payload.');
    }

    return {
      status: value.status,
      message: value.message,
      result: value.result as readonly unknown[] | string,
    };
  }
}
