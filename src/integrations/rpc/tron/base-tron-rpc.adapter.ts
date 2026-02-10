import { Logger } from '@nestjs/common';

import type {
  BlockEnvelope,
  ReceiptEnvelope,
  ReceiptLogEnvelope,
  TransactionEnvelope,
} from '../../../core/ports/rpc/block-stream.interfaces';
import type {
  BlockHandler,
  IRpcAdapter,
  ISubscriptionHandle,
  ProviderHealth,
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

const DEFAULT_TIMEOUT_MS: number = 8000;
const BLOCK_POLL_INTERVAL_MS: number = 1500;
const HEX_40_SYMBOL_PATTERN: RegExp = /^[0-9a-fA-F]{40}$/;

export abstract class BaseTronRpcAdapter implements IRpcAdapter {
  private readonly logger: Logger;

  protected constructor(
    private readonly httpUrl: string | null,
    private readonly providerName: string,
    private readonly tronApiKey: string | null,
    private readonly tronAddressCodec: TronAddressCodec,
  ) {
    this.logger = new Logger(providerName);
  }

  public getName(): string {
    return this.providerName;
  }

  public async subscribeBlocks(handler: BlockHandler): Promise<ISubscriptionHandle> {
    let lastObservedBlock: number | null = null;
    const intervalHandle: NodeJS.Timeout = setInterval((): void => {
      void this.pollNewBlocks(handler, lastObservedBlock).then(
        (nextObservedBlock: number | null): void => {
          lastObservedBlock = nextObservedBlock;
        },
      );
    }, BLOCK_POLL_INTERVAL_MS);

    return {
      stop: async (): Promise<void> => {
        clearInterval(intervalHandle);
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

  public async getBlockEnvelope(blockNumber: number): Promise<BlockEnvelope | null> {
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
    const transactions: readonly TransactionEnvelope[] = (payload.transactions ?? []).map(
      (transaction: TronTransaction, index: number): TransactionEnvelope => {
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

  public async getReceiptEnvelope(txHash: string): Promise<ReceiptEnvelope | null> {
    const payload: TronGetTransactionInfoResponse =
      await this.callEndpoint<TronGetTransactionInfoResponse>('/wallet/gettransactioninfobyid', {
        value: txHash,
        visible: true,
      });

    if (!this.isObject(payload)) {
      return null;
    }

    const logs: readonly ReceiptLogEnvelope[] = (payload.log ?? []).map(
      (log: TronTransactionInfoLog, index: number): ReceiptLogEnvelope => ({
        address: this.resolveLogAddress(log.address),
        topics: this.resolveTopics(log.topics),
        data: this.resolveData(log.data),
        logIndex: index,
      }),
    );

    return {
      txHash,
      logs,
    };
  }

  public async healthCheck(): Promise<ProviderHealth> {
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

      for (
        let blockNumber: number = lastObservedBlock + 1;
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

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
