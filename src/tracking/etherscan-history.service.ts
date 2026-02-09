import { Injectable, Logger } from '@nestjs/common';

import {
  EtherscanHistoryAction,
  type EtherscanHistoryResponse,
  type EtherscanNormalTransaction,
  type EtherscanTokenTransaction,
  type HistoryTransactionItem,
} from './etherscan-history.interfaces';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class EtherscanHistoryService {
  private readonly logger: Logger = new Logger(EtherscanHistoryService.name);

  public constructor(private readonly appConfigService: AppConfigService) {}

  public async loadRecentTransactions(
    address: string,
    limit: number,
  ): Promise<readonly HistoryTransactionItem[]> {
    const apiKey: string | null = this.appConfigService.etherscanApiKey;

    if (!apiKey) {
      throw new Error('ETHERSCAN_API_KEY is not set. История временно недоступна.');
    }

    this.logger.debug(
      `history request address=${address} limit=${limit} endpoint=${this.appConfigService.etherscanApiBaseUrl}`,
    );

    const normalTransactionsResponse: EtherscanHistoryResponse = await this.requestHistory(
      address,
      limit,
      apiKey,
      EtherscanHistoryAction.TX_LIST,
    );

    if (this.isNoTransactionsResponse(normalTransactionsResponse)) {
      this.logger.debug(
        `history txlist empty, fallback to tokentx address=${address} limit=${limit}`,
      );
      const tokenTransactionsResponse: EtherscanHistoryResponse = await this.requestHistory(
        address,
        limit,
        apiKey,
        EtherscanHistoryAction.TOKEN_TX_LIST,
      );

      if (this.isNoTransactionsResponse(tokenTransactionsResponse)) {
        return [];
      }

      if (tokenTransactionsResponse.status !== '1') {
        throw new Error(`Etherscan API error: ${this.extractApiError(tokenTransactionsResponse)}`);
      }

      if (typeof tokenTransactionsResponse.result === 'string') {
        return [];
      }

      return tokenTransactionsResponse.result.map(
        (value: unknown): HistoryTransactionItem => this.mapTokenTransaction(value),
      );
    }

    if (normalTransactionsResponse.status !== '1') {
      throw new Error(`Etherscan API error: ${this.extractApiError(normalTransactionsResponse)}`);
    }

    if (typeof normalTransactionsResponse.result === 'string') {
      return [];
    }

    return normalTransactionsResponse.result.map(
      (value: unknown): HistoryTransactionItem => this.mapNormalTransaction(value),
    );
  }

  private async requestHistory(
    address: string,
    limit: number,
    apiKey: string,
    action: EtherscanHistoryAction,
  ): Promise<EtherscanHistoryResponse> {
    const url: URL = new URL(this.appConfigService.etherscanApiBaseUrl);
    url.searchParams.set('chainid', '1');
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', action);
    url.searchParams.set('address', address);
    url.searchParams.set('startblock', '0');
    url.searchParams.set('endblock', '99999999');
    url.searchParams.set('page', '1');
    url.searchParams.set('offset', String(limit));
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('apikey', apiKey);

    const response: Response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Etherscan HTTP ${response.status}`);
    }

    const payload: unknown = await response.json();
    return this.parseHistoryResponse(payload);
  }

  private mapNormalTransaction(value: unknown): HistoryTransactionItem {
    const tx: EtherscanNormalTransaction = this.parseNormalTransaction(value);

    return {
      hash: tx.hash,
      timestampSec: Number.parseInt(tx.timeStamp, 10),
      from: tx.from,
      to: tx.to,
      valueRaw: tx.value,
      isError: tx.isError !== '0',
      assetSymbol: 'ETH',
      assetDecimals: 18,
    };
  }

  private mapTokenTransaction(value: unknown): HistoryTransactionItem {
    const tx: EtherscanTokenTransaction = this.parseTokenTransaction(value);
    const parsedDecimals: number = Number.parseInt(tx.tokenDecimal, 10);
    const tokenDecimals: number = Number.isNaN(parsedDecimals) ? 0 : parsedDecimals;

    return {
      hash: tx.hash,
      timestampSec: Number.parseInt(tx.timeStamp, 10),
      from: tx.from,
      to: tx.to,
      valueRaw: tx.value,
      isError: tx.isError === '1',
      assetSymbol: tx.tokenSymbol,
      assetDecimals: tokenDecimals,
    };
  }

  private parseNormalTransaction(value: unknown): EtherscanNormalTransaction {
    const tx: Record<string, unknown> = this.parseTransactionObject(value);
    const requiredStringFields: readonly string[] = [
      'hash',
      'timeStamp',
      'from',
      'to',
      'value',
      'isError',
    ];

    for (const field of requiredStringFields) {
      if (typeof tx[field] !== 'string') {
        throw new Error(`Etherscan normal tx field "${field}" is invalid.`);
      }
    }

    return tx as unknown as EtherscanNormalTransaction;
  }

  private parseTokenTransaction(value: unknown): EtherscanTokenTransaction {
    const tx: Record<string, unknown> = this.parseTransactionObject(value);
    const requiredStringFields: readonly string[] = [
      'hash',
      'timeStamp',
      'from',
      'to',
      'value',
      'tokenSymbol',
      'tokenDecimal',
    ];

    for (const field of requiredStringFields) {
      if (typeof tx[field] !== 'string') {
        throw new Error(`Etherscan token tx field "${field}" is invalid.`);
      }
    }

    if (tx['isError'] !== undefined && typeof tx['isError'] !== 'string') {
      throw new Error('Etherscan token tx field "isError" is invalid.');
    }

    return tx as unknown as EtherscanTokenTransaction;
  }

  private parseTransactionObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      throw new Error('Etherscan transaction item is invalid.');
    }

    return value as Record<string, unknown>;
  }

  private isNoTransactionsResponse(response: EtherscanHistoryResponse): boolean {
    return (
      response.status === '0' &&
      response.message.toLowerCase() === 'no transactions found' &&
      Array.isArray(response.result) &&
      response.result.length === 0
    );
  }

  private extractApiError(response: EtherscanHistoryResponse): string {
    if (typeof response.result === 'string' && response.result.trim().length > 0) {
      return response.result;
    }

    return response.message;
  }

  private parseHistoryResponse(payload: unknown): EtherscanHistoryResponse {
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
