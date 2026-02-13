import { Logger } from '@nestjs/common';

const RADIX_HEX = 16;

import type {
  IBlockEnvelope,
  IReceiptEnvelope,
  IReceiptLogEnvelope,
  ITransactionEnvelope,
} from '../../../core/ports/rpc/block-stream.interfaces';
import type {
  BlockHandler,
  IRpcAdapter,
  ISubscriptionHandle,
  IProviderHealth,
} from '../../../core/ports/rpc/rpc-adapter.interfaces';
import type { TronAddressCodec } from '../../address/tron/tron-address.codec';

type TronBlockHeader = {
  readonly raw_data?: {
    readonly number?: number;
    readonly timestamp?: number;
  };
};

type TronContractValue = {
  readonly owner_address?: string;
  readonly to_address?: string;
};

type TronContract = {
  readonly parameter?: {
    readonly value?: TronContractValue;
  };
};

type TronTransaction = {
  readonly txID?: string;
  readonly raw_data?: {
    readonly contract?: readonly TronContract[];
  };
};

type TronGetNowBlockResponse = {
  readonly block_header?: TronBlockHeader;
};

type TronGetBlockByNumResponse = {
  readonly block_header?: TronBlockHeader;
  readonly transactions?: readonly TronTransaction[];
};

type TronTransactionInfoLog = {
  readonly address?: string;
  readonly topics?: readonly string[];
  readonly data?: string;
};

type TronGetTransactionInfoResponse = {
  readonly id?: string;
  readonly log?: readonly TronTransactionInfoLog[];
};

type TronTransactionByIdContractValue = {
  readonly amount?: number | string;
  readonly asset_name?: string;
  readonly asset_id?: string;
};

type TronTransactionByIdContract = {
  readonly type?: string;
  readonly parameter?: {
    readonly value?: TronTransactionByIdContractValue;
  };
};

type TronGetTransactionByIdResponse = {
  readonly raw_data?: {
    readonly contract?: readonly TronTransactionByIdContract[];
  };
};

const DEFAULT_TIMEOUT_MS: number = 8000;
const DEFAULT_BLOCK_POLL_INTERVAL_MS: number = 1500;
const DEFAULT_MAX_BLOCK_CATCHUP_PER_POLL: number = 8;
const DEFAULT_POLL_JITTER_MS: number = 300;
const HEX_40_SYMBOL_PATTERN: RegExp = /^[0-9a-fA-F]{40}$/;
const TRC10_HINT_TOPIC: string = 'tron:trc10';
const TRON_NATIVE_HINT_TOPIC: string = 'tron:native';

type TronStreamOptions = {
  readonly pollIntervalMs: number;
  readonly maxBlockCatchupPerPoll: number;
  readonly pollJitterMs: number;
};

export abstract class BaseTronRpcAdapter implements IRpcAdapter {
  private readonly logger: Logger;
  private readonly streamOptions: TronStreamOptions;

  protected constructor(
    private readonly httpUrl: string | null,
    private readonly providerName: string,
    private readonly tronApiKey: string | null,
    private readonly tronAddressCodec: TronAddressCodec,
    streamOptions?: Partial<TronStreamOptions>,
  ) {
    this.logger = new Logger(providerName);
    this.streamOptions = {
      pollIntervalMs: streamOptions?.pollIntervalMs ?? DEFAULT_BLOCK_POLL_INTERVAL_MS,
      maxBlockCatchupPerPoll:
        streamOptions?.maxBlockCatchupPerPoll ?? DEFAULT_MAX_BLOCK_CATCHUP_PER_POLL,
      pollJitterMs: streamOptions?.pollJitterMs ?? DEFAULT_POLL_JITTER_MS,
    };
  }

  public getName(): string {
    return this.providerName;
  }

  public async subscribeBlocks(handler: BlockHandler): Promise<ISubscriptionHandle> {
    let lastObservedBlock: number | null = null;
    let stopped: boolean = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const scheduleNextTick = (): void => {
      if (stopped) {
        return;
      }

      timeoutHandle = setTimeout((): void => {
        void pollTick();
      }, this.streamOptions.pollIntervalMs);
      timeoutHandle.unref();
    };

    const pollTick = async (): Promise<void> => {
      if (stopped) {
        return;
      }

      const jitterMs: number = this.resolveJitterMs();

      if (jitterMs > 0) {
        await this.sleep(jitterMs);
      }

      lastObservedBlock = await this.pollNewBlocks(handler, lastObservedBlock);
      scheduleNextTick();
    };

    scheduleNextTick();

    return {
      stop: async (): Promise<void> => {
        stopped = true;

        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      },
    };
  }

  public async getLatestBlockNumber(): Promise<number> {
    const payload: TronGetNowBlockResponse = await this.callEndpoint<TronGetNowBlockResponse>(
      '/wallet/getnowblock',
      {},
    );
    const blockNumber: number | null = this.resolveBlockNumber(payload.block_header);

    if (blockNumber === null) {
      throw new Error('TRON getnowblock response does not include block number.');
    }

    return blockNumber;
  }

  public async getBlockEnvelope(blockNumber: number): Promise<IBlockEnvelope | null> {
    const payload: TronGetBlockByNumResponse = await this.callEndpoint<TronGetBlockByNumResponse>(
      '/wallet/getblockbynum',
      {
        num: blockNumber,
        visible: true,
      },
    );
    const resolvedBlockNumber: number | null = this.resolveBlockNumber(payload.block_header);

    if (resolvedBlockNumber === null) {
      return null;
    }

    const timestampMs: number | null = this.resolveTimestampMs(payload.block_header);
    const timestampSec: number | null =
      typeof timestampMs === 'number' ? Math.floor(timestampMs / 1000) : null;
    const transactions: readonly ITransactionEnvelope[] = (payload.transactions ?? []).map(
      (transaction: TronTransaction, index: number): ITransactionEnvelope => {
        const txHash: string =
          typeof transaction.txID === 'string' && transaction.txID.length > 0
            ? transaction.txID
            : `tron-${String(resolvedBlockNumber)}-${String(index)}`;
        const fromAddress: string =
          this.resolveTronAddress(
            transaction.raw_data?.contract?.[0]?.parameter?.value?.owner_address,
          ) ?? 'unknown';
        const toAddress: string | null = this.resolveTronAddress(
          transaction.raw_data?.contract?.[0]?.parameter?.value?.to_address,
        );

        return {
          hash: txHash,
          from: fromAddress,
          to: toAddress,
          blockTimestampSec: timestampSec,
        };
      },
    );

    return {
      number: resolvedBlockNumber,
      timestampSec,
      transactions,
    };
  }

  public async getReceiptEnvelope(txHash: string): Promise<IReceiptEnvelope | null> {
    const payload: TronGetTransactionInfoResponse =
      await this.callEndpoint<TronGetTransactionInfoResponse>('/wallet/gettransactioninfobyid', {
        value: txHash,
        visible: true,
      });
    const txPayload: TronGetTransactionByIdResponse =
      await this.callEndpoint<TronGetTransactionByIdResponse>('/wallet/gettransactionbyid', {
        value: txHash,
        visible: true,
      });

    if (!this.isObject(payload)) {
      return null;
    }

    const baseLogs: IReceiptLogEnvelope[] = (payload.log ?? []).map(
      (log: TronTransactionInfoLog, index: number): IReceiptLogEnvelope => ({
        address: this.resolveLogAddress(log.address),
        topics: this.resolveTopics(log.topics),
        data: this.resolveData(log.data),
        logIndex: index,
      }),
    );
    const hintLog: IReceiptLogEnvelope | null = this.buildContractHintLog(
      txPayload,
      baseLogs.length,
    );
    const logs: readonly IReceiptLogEnvelope[] =
      hintLog === null ? baseLogs : [...baseLogs, hintLog];

    return {
      txHash,
      logs,
    };
  }

  public async healthCheck(): Promise<IProviderHealth> {
    if (this.httpUrl === null) {
      return {
        provider: this.providerName,
        ok: false,
        details: 'Provider HTTP URL is not configured',
      };
    }

    try {
      const latestBlockNumber: number = await this.getLatestBlockNumber();

      return {
        provider: this.providerName,
        ok: true,
        details: `reachable, latestBlock=${String(latestBlockNumber)}`,
      };
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      return {
        provider: this.providerName,
        ok: false,
        details: errorMessage,
      };
    }
  }

  public async disconnect(): Promise<void> {
    return;
  }

  private async pollNewBlocks(
    handler: BlockHandler,
    lastObservedBlock: number | null,
  ): Promise<number | null> {
    try {
      const latestBlockNumber: number = await this.getLatestBlockNumber();

      if (lastObservedBlock === null) {
        return latestBlockNumber;
      }

      if (latestBlockNumber <= lastObservedBlock) {
        return lastObservedBlock;
      }

      const startBlockNumber: number = Math.max(
        lastObservedBlock + 1,
        latestBlockNumber - this.streamOptions.maxBlockCatchupPerPoll + 1,
      );

      for (
        let blockNumber: number = startBlockNumber;
        blockNumber <= latestBlockNumber;
        blockNumber += 1
      ) {
        await handler(blockNumber);
      }

      return latestBlockNumber;
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`TRON block poll failed: ${errorMessage}`);
      return lastObservedBlock;
    }
  }

  private async callEndpoint<TResult>(path: string, payload: unknown): Promise<TResult> {
    if (this.httpUrl === null) {
      throw new Error(`Provider HTTP URL is missing for ${this.providerName}`);
    }

    const abortController: AbortController = new AbortController();
    const timeoutHandle: NodeJS.Timeout = setTimeout((): void => {
      abortController.abort();
    }, DEFAULT_TIMEOUT_MS);
    const requestUrl: string = `${this.httpUrl}${path}`;

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };

      if (this.tronApiKey !== null) {
        headers['TRON-PRO-API-KEY'] = this.tronApiKey;
      }

      const response: Response = await fetch(requestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(
          `TRON RPC request failed path=${path} status=${String(response.status)} provider=${this.providerName}`,
        );
      }

      const responsePayload: unknown = (await response.json()) as unknown;

      if (!this.isObject(responsePayload)) {
        throw new Error(`TRON RPC response has invalid shape path=${path}`);
      }

      return responsePayload as TResult;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private resolveBlockNumber(blockHeader: TronBlockHeader | undefined): number | null {
    if (!blockHeader?.raw_data || typeof blockHeader.raw_data.number !== 'number') {
      return null;
    }

    return blockHeader.raw_data.number;
  }

  private resolveTimestampMs(blockHeader: TronBlockHeader | undefined): number | null {
    if (!blockHeader?.raw_data || typeof blockHeader.raw_data.timestamp !== 'number') {
      return null;
    }

    return blockHeader.raw_data.timestamp;
  }

  private resolveTronAddress(rawAddress: unknown): string | null {
    if (typeof rawAddress !== 'string') {
      return null;
    }

    const normalizedAddress: string | null = this.tronAddressCodec.normalize(rawAddress);
    return normalizedAddress;
  }

  private resolveLogAddress(rawAddress: string | undefined): string {
    if (typeof rawAddress !== 'string' || rawAddress.trim().length === 0) {
      return 'tron-log';
    }

    const normalizedRawAddress: string = rawAddress.trim();
    const withPrefix: string = HEX_40_SYMBOL_PATTERN.test(normalizedRawAddress)
      ? `41${normalizedRawAddress}`
      : normalizedRawAddress;
    const normalizedAddress: string | null = this.tronAddressCodec.normalize(withPrefix);

    return normalizedAddress ?? 'tron-log';
  }

  private resolveTopics(rawTopics: readonly string[] | undefined): readonly string[] {
    if (!Array.isArray(rawTopics)) {
      return [];
    }

    return rawTopics.map((rawTopic: string): string => {
      const normalizedTopic: string = rawTopic.trim();
      return normalizedTopic.startsWith('0x') ? normalizedTopic : `0x${normalizedTopic}`;
    });
  }

  private resolveData(rawData: string | undefined): string {
    if (typeof rawData !== 'string' || rawData.trim().length === 0) {
      return '0x';
    }

    const normalizedData: string = rawData.trim();
    return normalizedData.startsWith('0x') ? normalizedData : `0x${normalizedData}`;
  }

  private buildContractHintLog(
    transactionPayload: TronGetTransactionByIdResponse,
    logIndex: number,
  ): IReceiptLogEnvelope | null {
    const contracts: readonly TronTransactionByIdContract[] =
      transactionPayload.raw_data?.contract ?? [];
    const firstContract: TronTransactionByIdContract | undefined = contracts[0];

    if (typeof firstContract?.type !== 'string') {
      return null;
    }

    const contractValue: TronTransactionByIdContractValue | undefined =
      firstContract.parameter?.value;
    const amountRaw: string = this.normalizeAmount(contractValue?.amount);

    if (firstContract.type === 'TransferAssetContract') {
      const assetId: string = this.normalizeAssetId(contractValue);
      return {
        address: 'tron-system',
        topics: [TRC10_HINT_TOPIC, assetId],
        data: this.toHexAmount(amountRaw),
        logIndex,
      };
    }

    if (firstContract.type === 'TransferContract') {
      return {
        address: 'tron-system',
        topics: [TRON_NATIVE_HINT_TOPIC],
        data: this.toHexAmount(amountRaw),
        logIndex,
      };
    }

    return null;
  }

  private normalizeAmount(rawAmount: number | string | undefined): string {
    if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) {
      return Math.max(0, Math.floor(rawAmount)).toString();
    }

    if (typeof rawAmount === 'string') {
      const normalizedRawAmount: string = rawAmount.trim();

      if (/^\d+$/.test(normalizedRawAmount)) {
        return normalizedRawAmount;
      }
    }

    return '0';
  }

  private normalizeAssetId(contractValue: TronTransactionByIdContractValue | undefined): string {
    if (
      typeof contractValue?.asset_name === 'string' &&
      contractValue.asset_name.trim().length > 0
    ) {
      return contractValue.asset_name.trim();
    }

    if (typeof contractValue?.asset_id === 'string' && contractValue.asset_id.trim().length > 0) {
      return contractValue.asset_id.trim();
    }

    return 'TRC10';
  }

  private toHexAmount(amountRaw: string): string {
    try {
      return `0x${BigInt(amountRaw).toString(RADIX_HEX)}`;
    } catch {
      return '0x0';
    }
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private resolveJitterMs(): number {
    if (this.streamOptions.pollJitterMs <= 0) {
      return 0;
    }

    return Math.floor(Math.random() * (this.streamOptions.pollJitterMs + 1));
  }

  private async sleep(waitMs: number): Promise<void> {
    await new Promise<void>((resolve: () => void): void => {
      setTimeout((): void => {
        resolve();
      }, waitMs);
    });
  }
}
