import { Injectable, Logger } from '@nestjs/common';

import type {
  ISolanaSignatureInfo,
  ISolanaTransactionValue,
} from './solana-rpc-history.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import {
  LimiterKey,
  RequestPriority,
} from '../../blockchain/rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../../blockchain/rate-limiting/bottleneck-rate-limiter.service';
import {
  HistoryDirection,
  HistoryItemType,
  type IHistoryItemDto,
  type IHistoryPageDto,
} from '../../whales/entities/history-item.dto';
import {
  HistoryDirectionFilter,
  HistoryKind,
  type IHistoryRequestDto,
} from '../../whales/entities/history-request.dto';

const SPL_TOKEN_PROGRAM_SUBSTRING = 'tokenkeg';
const SOLSCAN_TX_BASE_URL = 'https://solscan.io/tx/';
const SOLANA_HISTORY_REQUEST_TIMEOUT_MS = 10_000;
const SPL_TOKEN_DECIMALS = 6;
const SOL_NATIVE_DECIMALS = 9;

@Injectable()
export class SolanaRpcHistoryAdapter implements IHistoryExplorerAdapter {
  private readonly logger: Logger = new Logger(SolanaRpcHistoryAdapter.name);

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly rateLimiterService: BottleneckRateLimiterService,
  ) {}

  public async loadRecentTransactions(request: IHistoryRequestDto): Promise<IHistoryPageDto> {
    if (request.chainKey !== ChainKey.SOLANA_MAINNET) {
      throw new Error(`Solana history adapter does not support chain ${request.chainKey}.`);
    }

    const endpointUrls: readonly string[] = this.resolveSolanaRpcEndpoints();
    const signaturesLimit: number = Math.max(request.offset + request.limit, request.limit);
    const signatures: readonly ISolanaSignatureInfo[] = await this.callWithFallback(
      endpointUrls,
      async (endpointUrl: string): Promise<readonly ISolanaSignatureInfo[]> =>
        this.getSignatures(endpointUrl, request.address, signaturesLimit),
    );

    const pageSignatures: readonly ISolanaSignatureInfo[] = signatures.slice(
      request.offset,
      request.offset + request.limit,
    );

    if (pageSignatures.length === 0) {
      return {
        items: [],
        nextOffset: null,
      };
    }

    const items: IHistoryItemDto[] = [];

    for (const signatureInfo of pageSignatures) {
      const item: IHistoryItemDto | null = await this.callWithFallback(
        endpointUrls,
        async (endpointUrl: string): Promise<IHistoryItemDto | null> =>
          this.mapSignatureToHistoryItem(endpointUrl, request.address, signatureInfo),
      );

      if (item === null) {
        continue;
      }

      if (!this.matchKindFilter(item, request.kind)) {
        continue;
      }

      if (!this.matchDirectionFilter(item, request.direction)) {
        continue;
      }

      items.push(item);
    }

    const hasNextPage: boolean = signatures.length > request.offset + request.limit;

    return {
      items,
      nextOffset: hasNextPage ? request.offset + request.limit : null,
    };
  }

  private resolveSolanaRpcEndpoints(): readonly string[] {
    const endpointCandidates: readonly (string | null)[] = [
      this.appConfigService.solanaHeliusHttpUrl,
      this.appConfigService.solanaPublicHttpUrl,
    ];
    const endpointUrls: string[] = [];

    for (const endpointCandidate of endpointCandidates) {
      if (endpointCandidate === null || endpointCandidate.trim().length === 0) {
        continue;
      }

      if (!endpointUrls.includes(endpointCandidate)) {
        endpointUrls.push(endpointCandidate);
      }
    }

    if (endpointUrls.length === 0) {
      throw new Error('SOLANA_HELIUS_HTTP_URL or SOLANA_PUBLIC_HTTP_URL is required.');
    }

    return endpointUrls;
  }

  private async getSignatures(
    endpointUrl: string,
    address: string,
    limit: number,
  ): Promise<readonly ISolanaSignatureInfo[]> {
    const payload: unknown = await this.callRpc(endpointUrl, 'getSignaturesForAddress', [
      address,
      {
        limit,
      },
    ]);

    if (!Array.isArray(payload)) {
      throw new Error('Solana getSignaturesForAddress returned invalid payload.');
    }

    return payload.map((value: unknown): ISolanaSignatureInfo => this.parseSignatureInfo(value));
  }

  private parseSignatureInfo(value: unknown): ISolanaSignatureInfo {
    if (!value || typeof value !== 'object') {
      throw new Error('Solana signature info item is invalid.');
    }

    const item = value as {
      readonly signature?: unknown;
      readonly blockTime?: unknown;
      readonly err?: unknown;
    };

    if (typeof item.signature !== 'string' || item.signature.trim().length === 0) {
      throw new Error('Solana signature info does not contain signature.');
    }

    const blockTime: number | null = typeof item.blockTime === 'number' ? item.blockTime : null;

    return {
      signature: item.signature,
      blockTime,
      err: item.err ?? null,
    };
  }

  private async mapSignatureToHistoryItem(
    endpointUrl: string,
    address: string,
    signatureInfo: ISolanaSignatureInfo,
  ): Promise<IHistoryItemDto | null> {
    const payload: unknown = await this.callRpc(endpointUrl, 'getTransaction', [
      signatureInfo.signature,
      {
        commitment: 'confirmed',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
      },
    ]);

    if (payload === null) {
      return null;
    }
    const value: ISolanaTransactionValue = this.parseTransactionValue(payload);
    const accountKeys: readonly string[] = this.extractAccountKeys(value);
    const [fromAddress, toAddress] = this.resolveFromTo(accountKeys);
    const deltaLamports: number = this.resolveLamportsDelta(accountKeys, value, address);
    const direction: HistoryDirection = this.resolveDirectionByLamportsDelta(deltaLamports);
    const isSplTransfer: boolean = this.detectSplTransfer(value);
    const timestampSec: number = this.resolveTimestampSec(value, signatureInfo);
    const hasError: boolean = this.resolveErrorFlag(value, signatureInfo);

    return {
      txHash: signatureInfo.signature,
      timestampSec,
      from: fromAddress,
      to: toAddress,
      valueRaw: Math.abs(deltaLamports).toString(),
      isError: hasError,
      assetSymbol: isSplTransfer ? 'SPL' : 'SOL',
      assetDecimals: isSplTransfer ? SPL_TOKEN_DECIMALS : SOL_NATIVE_DECIMALS,
      eventType: HistoryItemType.TRANSFER,
      direction,
      txLink: `${SOLSCAN_TX_BASE_URL}${signatureInfo.signature}`,
    };
  }

  private parseTransactionValue(payload: unknown): ISolanaTransactionValue {
    if (typeof payload !== 'object') {
      throw new Error('Solana getTransaction returned invalid payload.');
    }

    return payload as ISolanaTransactionValue;
  }

  private resolveLamportsDelta(
    accountKeys: readonly string[],
    value: ISolanaTransactionValue,
    address: string,
  ): number {
    const normalizedAddress: string = address.trim();
    const addressIndex: number = accountKeys.findIndex(
      (accountKey: string): boolean => accountKey === normalizedAddress,
    );

    if (addressIndex < 0) {
      return 0;
    }

    const preBalance: number = value.meta?.preBalances?.[addressIndex] ?? 0;
    const postBalance: number = value.meta?.postBalances?.[addressIndex] ?? 0;
    return postBalance - preBalance;
  }

  private resolveDirectionByLamportsDelta(deltaLamports: number): HistoryDirection {
    return deltaLamports >= 0 ? HistoryDirection.IN : HistoryDirection.OUT;
  }

  private resolveErrorFlag(
    value: ISolanaTransactionValue,
    signatureInfo: ISolanaSignatureInfo,
  ): boolean {
    const metaError: unknown = value.meta?.err;
    const hasMetaError: boolean = metaError !== undefined && metaError !== null;
    const hasSignatureError: boolean =
      signatureInfo.err !== null && signatureInfo.err !== undefined;

    return hasMetaError || hasSignatureError;
  }

  private detectSplTransfer(value: ISolanaTransactionValue): boolean {
    const logMessages: readonly string[] = value.meta?.logMessages ?? [];

    return logMessages.some((message: string): boolean =>
      message.toLowerCase().includes(SPL_TOKEN_PROGRAM_SUBSTRING),
    );
  }

  private extractAccountKeys(value: ISolanaTransactionValue): readonly string[] {
    const rawAccountKeys: readonly (string | { readonly pubkey?: string })[] =
      value.transaction?.message?.accountKeys ?? [];

    return rawAccountKeys
      .map((accountKey): string | null => {
        if (typeof accountKey === 'string') {
          return accountKey;
        }

        if (typeof accountKey.pubkey === 'string') {
          return accountKey.pubkey;
        }

        return null;
      })
      .filter((accountKey: string | null): accountKey is string => accountKey !== null);
  }

  private resolveFromTo(accountKeys: readonly string[]): readonly [string, string] {
    const fromAddress: string = accountKeys[0] ?? 'unknown';
    const toAddress: string = accountKeys[1] ?? 'unknown';

    return [fromAddress, toAddress];
  }

  private resolveTimestampSec(
    value: ISolanaTransactionValue,
    signatureInfo: ISolanaSignatureInfo,
  ): number {
    if (typeof value.blockTime === 'number') {
      return value.blockTime;
    }

    if (typeof signatureInfo.blockTime === 'number') {
      return signatureInfo.blockTime;
    }

    return Math.floor(Date.now() / 1000);
  }

  private matchKindFilter(item: IHistoryItemDto, kind: HistoryKind): boolean {
    if (kind === HistoryKind.ALL) {
      return true;
    }

    if (kind === HistoryKind.ETH) {
      return item.assetSymbol === 'SOL';
    }

    return item.assetSymbol === 'SPL';
  }

  private matchDirectionFilter(item: IHistoryItemDto, direction: HistoryDirectionFilter): boolean {
    if (direction === HistoryDirectionFilter.ALL) {
      return true;
    }

    if (direction === HistoryDirectionFilter.IN) {
      return item.direction === HistoryDirection.IN;
    }

    return item.direction === HistoryDirection.OUT;
  }

  private async callWithFallback<TResult>(
    endpointUrls: readonly string[],
    operation: (endpointUrl: string) => Promise<TResult>,
  ): Promise<TResult> {
    let lastError: Error | null = null;

    for (const endpointUrl of endpointUrls) {
      try {
        return await operation(endpointUrl);
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `solana history endpoint failed endpoint=${endpointUrl} reason=${errorMessage}`,
        );
        lastError = error instanceof Error ? error : new Error(errorMessage);
      }
    }

    if (lastError !== null) {
      throw lastError;
    }

    throw new Error('Solana history endpoint list is empty.');
  }

  private async callRpc(
    endpointUrl: string,
    method: string,
    params: readonly unknown[],
  ): Promise<unknown> {
    const response: Response = await this.rateLimiterService.schedule(
      LimiterKey.SOLANA_HELIUS,
      async (): Promise<Response> =>
        fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params,
          }),
          signal: AbortSignal.timeout(SOLANA_HISTORY_REQUEST_TIMEOUT_MS),
        }),
      RequestPriority.NORMAL,
    );

    if (!response.ok) {
      throw new Error(`Solana RPC HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      readonly result?: unknown;
      readonly error?: {
        readonly code?: number;
        readonly message?: string;
      };
    };

    if (payload.error !== undefined) {
      const errorCode: string = String(payload.error.code ?? 'unknown');
      const errorMessage: string = payload.error.message ?? 'unknown error';
      throw new Error(`Solana RPC error code=${errorCode} message=${errorMessage}`);
    }

    return payload.result ?? null;
  }
}
