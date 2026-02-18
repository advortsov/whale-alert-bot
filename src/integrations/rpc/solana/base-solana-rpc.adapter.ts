import { Logger } from '@nestjs/common';

import type {
  IBlockEnvelope,
  IReceiptEnvelope,
  ITransactionEnvelope,
} from '../../../modules/blockchain/base/block-stream.interfaces';
import type {
  BlockHandler,
  IRpcAdapter,
  ISubscriptionHandle,
  IProviderHealth,
} from '../../../modules/blockchain/base/rpc-adapter.interfaces';

type JsonRpcId = number;

type SolanaRpcErrorPayload = {
  readonly code: number;
  readonly message: string;
};

type SolanaRpcSuccessResponse<TResult> = {
  readonly jsonrpc: string;
  readonly id: JsonRpcId;
  readonly result: TResult;
};

type SolanaRpcErrorResponse = {
  readonly jsonrpc: string;
  readonly id: JsonRpcId;
  readonly error: SolanaRpcErrorPayload;
};

type SolanaRpcResponse<TResult> = SolanaRpcSuccessResponse<TResult> | SolanaRpcErrorResponse;

type SolanaAccountKeyEntry = string | { readonly pubkey?: string };

type SolanaBlockTransaction = {
  readonly transaction?: {
    readonly signatures?: readonly string[];
    readonly message?: {
      readonly accountKeys?: readonly SolanaAccountKeyEntry[];
    };
  };
};

type SolanaBlockResult = {
  readonly blockTime?: number | null;
  readonly transactions?: readonly SolanaBlockTransaction[];
};

type SolanaTransactionResult = {
  readonly meta?: {
    readonly logMessages?: readonly string[] | null;
  } | null;
};

type SolanaGetSlotResponse = number;

type SolanaGetBlockResponse = SolanaBlockResult | null;

type SolanaGetTransactionResponse = SolanaTransactionResult | null;

type SolanaStreamOptions = {
  readonly pollIntervalMs: number;
  readonly maxSlotCatchupPerPoll: number;
  readonly pollJitterMs: number;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_SLOT_CATCHUP_PER_POLL = 8;
const DEFAULT_POLL_JITTER_MS = 300;

export abstract class BaseSolanaRpcAdapter implements IRpcAdapter {
  private readonly logger: Logger;
  private readonly streamOptions: SolanaStreamOptions;

  protected constructor(
    private readonly httpUrl: string | null,
    private readonly wsUrl: string | null,
    private readonly providerName: string,
    streamOptions?: Partial<SolanaStreamOptions>,
  ) {
    this.logger = new Logger(providerName);
    this.streamOptions = {
      pollIntervalMs: streamOptions?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      maxSlotCatchupPerPoll:
        streamOptions?.maxSlotCatchupPerPoll ?? DEFAULT_MAX_SLOT_CATCHUP_PER_POLL,
      pollJitterMs: streamOptions?.pollJitterMs ?? DEFAULT_POLL_JITTER_MS,
    };
  }

  public getName(): string {
    return this.providerName;
  }

  public async subscribeBlocks(handler: BlockHandler): Promise<ISubscriptionHandle> {
    if (!this.wsUrl) {
      throw new Error(`Provider WS URL is missing for ${this.providerName}`);
    }

    let lastObservedSlot: number | null = null;
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

      lastObservedSlot = await this.pollNewSlots(handler, lastObservedSlot);
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
    return this.callRpc<SolanaGetSlotResponse>('getSlot', []);
  }

  public async getBlockEnvelope(blockNumber: number): Promise<IBlockEnvelope | null> {
    let blockResult: SolanaGetBlockResponse;

    try {
      blockResult = await this.callRpc<SolanaGetBlockResponse>('getBlock', [
        blockNumber,
        {
          commitment: 'confirmed',
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
          transactionDetails: 'full',
          rewards: false,
        },
      ]);
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);

      if (this.isSkippedSlotError(errorMessage)) {
        return null;
      }

      throw error;
    }

    if (blockResult === null) {
      return null;
    }

    const blockTimestampSec: number | null =
      typeof blockResult.blockTime === 'number' ? blockResult.blockTime : null;

    const transactions: readonly ITransactionEnvelope[] = (blockResult.transactions ?? []).map(
      (transaction: SolanaBlockTransaction, index: number): ITransactionEnvelope => {
        const hash: string = this.extractTransactionHash(transaction, blockNumber, index);
        const fromAddress: string = this.extractAccountKey(transaction, 0) ?? 'unknown';
        const toAddress: string | null = this.extractAccountKey(transaction, 1);

        return {
          hash,
          from: fromAddress,
          to: toAddress,
          blockTimestampSec,
        };
      },
    );

    return {
      number: blockNumber,
      timestampSec: blockTimestampSec,
      transactions,
    };
  }

  public async getReceiptEnvelope(txHash: string): Promise<IReceiptEnvelope | null> {
    const transactionResult: SolanaGetTransactionResponse =
      await this.callRpc<SolanaGetTransactionResponse>('getTransaction', [
        txHash,
        {
          commitment: 'confirmed',
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
        },
      ]);

    if (transactionResult === null) {
      return null;
    }

    const logMessages: readonly string[] = transactionResult.meta?.logMessages ?? [];

    return {
      txHash,
      logs: logMessages.map(
        (
          message: string,
          index: number,
        ): { address: string; topics: readonly string[]; data: string; logIndex: number } => ({
          address: 'solana-log',
          topics: [],
          data: message,
          logIndex: index,
        }),
      ),
    };
  }

  public async healthCheck(): Promise<IProviderHealth> {
    if (!this.httpUrl) {
      return {
        provider: this.providerName,
        ok: false,
        details: 'Provider HTTP URL is not configured',
      };
    }

    try {
      const slotValue: number = await this.getLatestBlockNumber();

      return {
        provider: this.providerName,
        ok: true,
        details: `reachable, slot=${String(slotValue)}`,
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

  private async pollNewSlots(
    handler: BlockHandler,
    lastObservedSlot: number | null,
  ): Promise<number | null> {
    try {
      const latestSlot: number = await this.getLatestBlockNumber();

      if (lastObservedSlot === null) {
        return latestSlot;
      }

      if (latestSlot <= lastObservedSlot) {
        return lastObservedSlot;
      }

      const startSlot: number = Math.max(
        lastObservedSlot + 1,
        latestSlot - this.streamOptions.maxSlotCatchupPerPoll + 1,
      );

      for (let slot: number = startSlot; slot <= latestSlot; slot += 1) {
        await handler(slot);
      }

      return latestSlot;
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Slot poll failed: ${errorMessage}`);
      return lastObservedSlot;
    }
  }

  private isSkippedSlotError(message: string): boolean {
    const normalizedMessage: string = message.toLowerCase();

    return (
      normalizedMessage.includes('code=-32007') ||
      normalizedMessage.includes('slot was skipped') ||
      normalizedMessage.includes('missing due to ledger jump')
    );
  }

  private async callRpc<TResult>(method: string, params: readonly unknown[]): Promise<TResult> {
    if (!this.httpUrl) {
      throw new Error(`Provider HTTP URL is missing for ${this.providerName}`);
    }

    const requestId: JsonRpcId = Date.now();
    const abortController: AbortController = new AbortController();
    const timeoutHandle: NodeJS.Timeout = setTimeout((): void => {
      abortController.abort();
    }, DEFAULT_TIMEOUT_MS);

    try {
      const response: Response = await fetch(this.httpUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method,
          params,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Solana RPC request failed method=${method} status=${String(response.status)}`,
        );
      }

      const payload: SolanaRpcResponse<TResult> =
        (await response.json()) as SolanaRpcResponse<TResult>;

      if ('error' in payload) {
        throw new Error(
          `Solana RPC error method=${method} code=${String(payload.error.code)} message=${payload.error.message}`,
        );
      }

      return payload.result;
    } finally {
      clearTimeout(timeoutHandle);
    }
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

  private extractTransactionHash(
    transaction: SolanaBlockTransaction,
    blockNumber: number,
    index: number,
  ): string {
    const signatures: readonly string[] = transaction.transaction?.signatures ?? [];
    const primarySignature: string | undefined = signatures[0];

    if (primarySignature) {
      return primarySignature;
    }

    return `solana-${String(blockNumber)}-${String(index)}`;
  }

  private extractAccountKey(
    transaction: SolanaBlockTransaction,
    accountIndex: number,
  ): string | null {
    const accountKeys: readonly SolanaAccountKeyEntry[] =
      transaction.transaction?.message?.accountKeys ?? [];
    const accountKeyEntry: SolanaAccountKeyEntry | undefined = accountKeys[accountIndex];

    if (typeof accountKeyEntry === 'string') {
      return accountKeyEntry;
    }

    if (accountKeyEntry && typeof accountKeyEntry.pubkey === 'string') {
      return accountKeyEntry.pubkey;
    }

    return null;
  }
}
