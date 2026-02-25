import { Injectable, Logger, Optional } from '@nestjs/common';

import {
  extractSolanaAccountKeys,
  matchSolanaHistoryDirection,
  matchSolanaHistoryKind,
  parseSolanaSignatureInfo,
  parseSolanaTransactionValue,
  resolveSolanaErrorFlag,
  resolveSolanaFromTo,
  resolveSolanaTransferDetails,
  resolveSolanaTimestampSec,
} from './solana-history-mapper.util';
import {
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HISTORY_WARN_COOLDOWN_MS,
  SOLANA_HISTORY_REQUEST_TIMEOUT_MS,
  SOLANA_SCAN_LIMIT_MAX,
  SOLANA_SIGNATURES_BATCH_DEFAULT,
  SOLANA_SIGNATURES_BATCH_MAX,
  SOLSCAN_TX_BASE_URL,
  resolveSolanaHistoryLimiterKey,
  resolveSolanaHistoryScanLimit,
  type ISolanaHistoryScanState,
} from './solana-rpc-history.constants';
import type {
  ISolanaSignatureInfo,
  ISolanaTransactionValue,
} from './solana-rpc-history.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import { RateLimitedWarningEmitter } from '../../../common/utils/logging/rate-limited-warning-emitter';
import { AppConfigService } from '../../../config/app-config.service';
import {
  LimiterKey,
  RequestPriority,
} from '../../blockchain/rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../../blockchain/rate-limiting/bottleneck-rate-limiter.service';
import { MetricsService } from '../../observability/metrics.service';
import {
  HistoryItemType,
  type IHistoryItemDto,
  type IHistoryPageDto,
} from '../../whales/entities/history-item.dto';
import { type IHistoryRequestDto } from '../../whales/entities/history-request.dto';

@Injectable()
export class SolanaRpcHistoryAdapter implements IHistoryExplorerAdapter {
  private readonly logger: Logger = new Logger(SolanaRpcHistoryAdapter.name);
  private readonly warningEmitter: RateLimitedWarningEmitter = new RateLimitedWarningEmitter(
    HISTORY_WARN_COOLDOWN_MS,
  );

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly rateLimiterService: BottleneckRateLimiterService,
    @Optional() private readonly metricsService: MetricsService | null = null,
  ) {}

  public async loadRecentTransactions(request: IHistoryRequestDto): Promise<IHistoryPageDto> {
    if (request.chainKey !== ChainKey.SOLANA_MAINNET) {
      throw new Error(`Solana history adapter does not support chain ${request.chainKey}.`);
    }

    const endpointUrls: readonly string[] = this.resolveSolanaRpcEndpoints();
    const scanState: ISolanaHistoryScanState = await this.initializeHistoryScanState(
      request,
      endpointUrls,
    );
    await this.collectHistoryItemsForPage(request, endpointUrls, scanState);
    this.logTruncatedScan(request, scanState.scannedSignaturesCount);
    return this.buildHistoryPageResult(request.limit, scanState);
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
    beforeSignature: string | null,
  ): Promise<readonly ISolanaSignatureInfo[]> {
    const payloadParams: readonly unknown[] = [
      address,
      beforeSignature === null
        ? {
            limit,
          }
        : {
            limit,
            before: beforeSignature,
          },
    ];
    const payload: unknown = await this.callRpc(
      endpointUrl,
      'getSignaturesForAddress',
      payloadParams,
    );

    if (!Array.isArray(payload)) {
      throw new Error('Solana getSignaturesForAddress returned invalid payload.');
    }

    return payload.map((value: unknown): ISolanaSignatureInfo => parseSolanaSignatureInfo(value));
  }

  private resolveSignaturesBatchLimit(limit: number): number {
    const withBuffer: number = Math.max(limit * 2, SOLANA_SIGNATURES_BATCH_DEFAULT);
    return Math.min(withBuffer, SOLANA_SIGNATURES_BATCH_MAX);
  }

  private async getSignaturesPage(
    endpointUrl: string,
    address: string,
    limit: number,
  ): Promise<{
    readonly signatures: readonly ISolanaSignatureInfo[];
    readonly reachedEnd: boolean;
  }> {
    const signatures: ISolanaSignatureInfo[] = [];
    let beforeSignature: string | null = null;
    let reachedEnd: boolean = false;

    while (signatures.length < limit && !reachedEnd) {
      const remainingCount: number = limit - signatures.length;
      const batchLimit: number = Math.min(remainingCount, SOLANA_SIGNATURES_BATCH_MAX);
      const batch: readonly ISolanaSignatureInfo[] = await this.getSignatures(
        endpointUrl,
        address,
        batchLimit,
        beforeSignature,
      );

      if (batch.length === 0) {
        reachedEnd = true;
        break;
      }

      signatures.push(...batch);
      beforeSignature = batch[batch.length - 1]?.signature ?? null;
      reachedEnd = batch.length < batchLimit;
    }

    return {
      signatures,
      reachedEnd,
    };
  }

  private async initializeHistoryScanState(
    request: IHistoryRequestDto,
    endpointUrls: readonly string[],
  ): Promise<ISolanaHistoryScanState> {
    const initialSignaturesLimit: number = Math.max(
      request.offset + request.limit + 1,
      request.limit + 1,
    );
    const initialSignaturesResult: {
      readonly signatures: readonly ISolanaSignatureInfo[];
      readonly reachedEnd: boolean;
    } = await this.callWithFallback(
      endpointUrls,
      async (
        endpointUrl: string,
      ): Promise<{
        readonly signatures: readonly ISolanaSignatureInfo[];
        readonly reachedEnd: boolean;
      }> => this.getSignaturesPage(endpointUrl, request.address, initialSignaturesLimit),
    );

    return {
      signatures: [...initialSignaturesResult.signatures],
      reachedSignaturesEnd: initialSignaturesResult.reachedEnd,
      signatureCursor: request.offset,
      scannedSignaturesCount: 0,
      pageItems: [],
    };
  }

  private async collectHistoryItemsForPage(
    request: IHistoryRequestDto,
    endpointUrls: readonly string[],
    scanState: ISolanaHistoryScanState,
  ): Promise<void> {
    const scanLimit: number = resolveSolanaHistoryScanLimit(request.offset, request.limit);

    while (
      scanState.pageItems.length < request.limit &&
      scanState.scannedSignaturesCount < scanLimit
    ) {
      const hasAvailableSignature: boolean = await this.ensureSignatureAvailable(
        request,
        endpointUrls,
        scanState,
      );

      if (!hasAvailableSignature) {
        return;
      }

      await this.scanSingleSignature(request, endpointUrls, scanState);
    }
  }

  private async ensureSignatureAvailable(
    request: IHistoryRequestDto,
    endpointUrls: readonly string[],
    scanState: ISolanaHistoryScanState,
  ): Promise<boolean> {
    if (scanState.signatureCursor < scanState.signatures.length) {
      return true;
    }

    if (scanState.reachedSignaturesEnd) {
      return false;
    }

    const beforeSignature: string | null =
      scanState.signatures[scanState.signatures.length - 1]?.signature ?? null;

    if (beforeSignature === null) {
      return false;
    }

    const additionalSignaturesLimit: number = this.resolveSignaturesBatchLimit(request.limit);
    const additionalSignaturesBatch: readonly ISolanaSignatureInfo[] = await this.callWithFallback(
      endpointUrls,
      async (endpointUrl: string): Promise<readonly ISolanaSignatureInfo[]> =>
        this.getSignatures(
          endpointUrl,
          request.address,
          additionalSignaturesLimit,
          beforeSignature,
        ),
    );

    if (additionalSignaturesBatch.length === 0) {
      scanState.reachedSignaturesEnd = true;
      return false;
    }

    scanState.signatures.push(...additionalSignaturesBatch);
    scanState.reachedSignaturesEnd = additionalSignaturesBatch.length < additionalSignaturesLimit;
    return true;
  }

  private async scanSingleSignature(
    request: IHistoryRequestDto,
    endpointUrls: readonly string[],
    scanState: ISolanaHistoryScanState,
  ): Promise<void> {
    const signatureInfo: ISolanaSignatureInfo | undefined =
      scanState.signatures[scanState.signatureCursor];
    scanState.signatureCursor += 1;
    scanState.scannedSignaturesCount += 1;

    if (signatureInfo === undefined) {
      return;
    }

    const item: IHistoryItemDto | null = await this.callWithFallback(
      endpointUrls,
      async (endpointUrl: string): Promise<IHistoryItemDto | null> =>
        this.mapSignatureToHistoryItem(endpointUrl, request.address, signatureInfo),
    );

    if (item === null) {
      return;
    }

    if (!matchSolanaHistoryKind(item, request.kind)) {
      return;
    }

    if (!matchSolanaHistoryDirection(item, request.direction)) {
      return;
    }

    scanState.pageItems.push(item);
  }

  private logTruncatedScan(request: IHistoryRequestDto, scannedSignaturesCount: number): void {
    const scanLimit: number = resolveSolanaHistoryScanLimit(request.offset, request.limit);

    if (scannedSignaturesCount < scanLimit) {
      return;
    }

    this.logger.warn(
      `solana history scan truncated address=${request.address} scanned=${String(scannedSignaturesCount)} scanLimit=${String(scanLimit)} limit=${String(request.limit)} offset=${String(request.offset)}`,
    );
  }

  private buildHistoryPageResult(
    requestLimit: number,
    scanState: ISolanaHistoryScanState,
  ): IHistoryPageDto {
    if (scanState.pageItems.length === 0) {
      return {
        items: [],
        nextOffset: null,
      };
    }

    const hasKnownTail: boolean = scanState.signatureCursor < scanState.signatures.length;
    const hasUnknownTail: boolean =
      scanState.pageItems.length >= requestLimit &&
      (!scanState.reachedSignaturesEnd ||
        scanState.scannedSignaturesCount >= SOLANA_SCAN_LIMIT_MAX);
    const hasNextPage: boolean =
      scanState.pageItems.length >= requestLimit && (hasKnownTail || hasUnknownTail);

    return {
      items: scanState.pageItems,
      nextOffset: hasNextPage ? scanState.signatureCursor : null,
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
    const value: ISolanaTransactionValue = parseSolanaTransactionValue(payload);
    const accountKeys: readonly string[] = extractSolanaAccountKeys(value);
    const [fromAddress, toAddress] = resolveSolanaFromTo(accountKeys);
    const transferDetails = resolveSolanaTransferDetails(accountKeys, value, address);
    const timestampSec: number = resolveSolanaTimestampSec(value, signatureInfo);
    const hasError: boolean = resolveSolanaErrorFlag(value, signatureInfo);

    if (transferDetails === null) {
      return null;
    }

    return {
      txHash: signatureInfo.signature,
      timestampSec,
      from: fromAddress,
      to: toAddress,
      valueRaw: transferDetails.valueRaw,
      isError: hasError,
      assetSymbol: transferDetails.assetSymbol,
      assetDecimals: transferDetails.assetDecimals,
      eventType: HistoryItemType.TRANSFER,
      direction: transferDetails.direction,
      txLink: `${SOLSCAN_TX_BASE_URL}${signatureInfo.signature}`,
    };
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
        const warningKey: string = `endpoint_failed:${endpointUrl}:${errorMessage}`;
        if (this.warningEmitter.shouldEmit(warningKey)) {
          this.logger.warn(
            `[SOL] history endpoint failed endpoint=${endpointUrl} reason=${errorMessage}`,
          );
        }
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
    const limiterKey: LimiterKey = resolveSolanaHistoryLimiterKey(
      endpointUrl,
      this.appConfigService.solanaPublicHttpUrl,
    );
    const response: Response = await this.rateLimiterService.schedule(
      limiterKey,
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
      if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS && this.metricsService !== null) {
        this.metricsService.historyHttp429Total.inc({
          chain: ChainKey.SOLANA_MAINNET,
          adapter: 'solana_rpc_history',
        });
        const warningKey: string = `history_http_429:${endpointUrl}:${method}`;
        if (this.warningEmitter.shouldEmit(warningKey)) {
          this.logger.warn(
            `history_http_429 chain=${ChainKey.SOLANA_MAINNET} adapter=solana_rpc_history endpoint=${endpointUrl} method=${method}`,
          );
        }
      }

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
