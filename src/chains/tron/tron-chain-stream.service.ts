import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { AlertDispatcherService } from '../../alerts/alert-dispatcher.service';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../chain/chain.types';
import { ProviderFailoverService } from '../../chain/providers/provider-failover.service';
import { AppConfigService } from '../../config/app-config.service';
import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type { TransactionEnvelope } from '../../core/ports/rpc/block-stream.interfaces';
import type { ISubscriptionHandle } from '../../core/ports/rpc/rpc-adapter.interfaces';
import { ChainCheckpointsRepository } from '../../storage/repositories/chain-checkpoints.repository';
import { ProcessedEventsRepository } from '../../storage/repositories/processed-events.repository';
import { SubscriptionsRepository } from '../../storage/repositories/subscriptions.repository';
import { WalletEventsRepository } from '../../storage/repositories/wallet-events.repository';

type TronMatchedTransaction = {
  readonly txHash: string;
  readonly txFrom: string;
  readonly txTo: string | null;
  readonly trackedAddress: string;
  readonly blockTimestampSec: number | null;
};

@Injectable()
export class TronChainStreamService implements OnModuleInit, OnModuleDestroy {
  private static readonly LOG_PREFIX: string = '[TRON]';
  private static readonly DEFAULT_HEARTBEAT_INTERVAL_SEC: number = 60;

  private readonly logger: Logger = new Logger(TronChainStreamService.name);
  private readonly blockQueue: number[] = [];
  private subscriptionHandle: ISubscriptionHandle | null = null;
  private isProcessingQueue: boolean = false;
  private lastObservedBlockNumber: number | null = null;
  private lastProcessedBlockNumber: number | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly providerFailoverService: ProviderFailoverService,
    private readonly chainCheckpointsRepository: ChainCheckpointsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly processedEventsRepository: ProcessedEventsRepository,
    private readonly walletEventsRepository: WalletEventsRepository,
    private readonly alertDispatcherService: AlertDispatcherService,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.appConfigService.tronWatcherEnabled) {
      this.logInfo('TRON watcher is disabled by config.');
      return;
    }

    await this.recoverFromCheckpoint();

    this.subscriptionHandle = await this.providerFailoverService.executeForChain(
      ChainKey.TRON_MAINNET,
      (provider) =>
        provider.subscribeBlocks(async (blockNumber: number): Promise<void> => {
          this.enqueueBlock(blockNumber);
        }),
    );

    this.startHeartbeat();
    this.logInfo('TRON watcher subscribed to new blocks.');
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopHeartbeat();

    if (this.subscriptionHandle !== null) {
      await this.subscriptionHandle.stop();
      this.subscriptionHandle = null;
    }
  }

  private async recoverFromCheckpoint(): Promise<void> {
    const latestBlockNumber: number = await this.providerFailoverService.executeForChain(
      ChainKey.TRON_MAINNET,
      (provider): Promise<number> => provider.getLatestBlockNumber(),
    );
    const checkpointBlockNumber: number | null =
      await this.chainCheckpointsRepository.getLastProcessedBlock(ChainKey.TRON_MAINNET);

    if (checkpointBlockNumber === null) {
      return;
    }

    this.lastProcessedBlockNumber = checkpointBlockNumber;

    if (latestBlockNumber <= checkpointBlockNumber) {
      return;
    }

    const maxBackfillBlocks: number = this.appConfigService.chainBlockQueueMax;
    const backfillFromBlock: number = Math.max(
      checkpointBlockNumber + 1,
      latestBlockNumber - maxBackfillBlocks + 1,
    );

    for (
      let blockNumber: number = backfillFromBlock;
      blockNumber <= latestBlockNumber;
      blockNumber += 1
    ) {
      this.enqueueBlock(blockNumber);
    }
  }

  private enqueueBlock(blockNumber: number): void {
    this.lastObservedBlockNumber = blockNumber;

    if (this.lastProcessedBlockNumber !== null && blockNumber <= this.lastProcessedBlockNumber) {
      return;
    }

    if (this.blockQueue.includes(blockNumber)) {
      return;
    }

    if (this.blockQueue.length >= this.appConfigService.chainBlockQueueMax) {
      const droppedCount: number = this.blockQueue.length;
      this.blockQueue.splice(0, this.blockQueue.length, blockNumber);
      this.logWarn(`tron queue overflow dropped=${droppedCount} retained=${blockNumber}`);
    } else {
      this.blockQueue.push(blockNumber);
    }

    if (!this.isProcessingQueue) {
      void this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.blockQueue.length > 0) {
        const blockNumber: number | undefined = this.blockQueue.shift();

        if (typeof blockNumber !== 'number') {
          continue;
        }

        try {
          await this.processBlock(blockNumber);
          this.lastProcessedBlockNumber = blockNumber;
          await this.chainCheckpointsRepository.saveLastProcessedBlock(
            ChainKey.TRON_MAINNET,
            ChainId.TRON_MAINNET,
            blockNumber,
          );
        } catch (error: unknown) {
          const errorMessage: string = error instanceof Error ? error.message : String(error);
          this.logWarn(`tron processBlock failed block=${blockNumber} reason=${errorMessage}`);
        }
      }
    } finally {
      this.isProcessingQueue = false;

      if (this.blockQueue.length > 0) {
        void this.processQueue();
      }
    }
  }

  private async processBlock(blockNumber: number): Promise<void> {
    const trackedAddresses: readonly string[] =
      await this.subscriptionsRepository.listTrackedAddresses(ChainKey.TRON_MAINNET);

    if (trackedAddresses.length === 0) {
      return;
    }

    const trackedAddressSet: ReadonlySet<string> = new Set(trackedAddresses);
    const blockEnvelope = await this.providerFailoverService.executeForChain(
      ChainKey.TRON_MAINNET,
      (provider) => provider.getBlockEnvelope(blockNumber),
    );

    if (blockEnvelope === null) {
      return;
    }

    const matchedTransactions: readonly TronMatchedTransaction[] = this.collectMatchedTransactions(
      blockEnvelope.transactions,
      trackedAddressSet,
      blockEnvelope.timestampSec,
    );
    this.logDebug(
      `processBlock block=${blockNumber} txCount=${blockEnvelope.transactions.length} matchedCount=${matchedTransactions.length}`,
    );

    for (const matchedTransaction of matchedTransactions) {
      await this.processMatchedTransaction(matchedTransaction);
    }
  }

  private collectMatchedTransactions(
    transactions: readonly TransactionEnvelope[],
    trackedAddressSet: ReadonlySet<string>,
    blockTimestampSec: number | null,
  ): readonly TronMatchedTransaction[] {
    const matchedTransactions: TronMatchedTransaction[] = [];

    for (const transaction of transactions) {
      const txFrom: string = transaction.from;
      const txTo: string | null = transaction.to;
      const matchedAddress: string | null = this.matchTrackedAddress(
        txFrom,
        txTo,
        trackedAddressSet,
      );

      if (matchedAddress === null) {
        continue;
      }

      matchedTransactions.push({
        txHash: transaction.hash,
        txFrom,
        txTo,
        trackedAddress: matchedAddress,
        blockTimestampSec,
      });
    }

    return matchedTransactions;
  }

  private matchTrackedAddress(
    txFrom: string,
    txTo: string | null,
    trackedAddressSet: ReadonlySet<string>,
  ): string | null {
    if (trackedAddressSet.has(txFrom)) {
      return txFrom;
    }

    if (txTo !== null && trackedAddressSet.has(txTo)) {
      return txTo;
    }

    return null;
  }

  private async processMatchedTransaction(
    matchedTransaction: TronMatchedTransaction,
  ): Promise<void> {
    this.logDebug(
      `processMatchedTransaction start txHash=${matchedTransaction.txHash} address=${matchedTransaction.trackedAddress}`,
    );

    const processedKey = {
      txHash: matchedTransaction.txHash,
      logIndex: 0,
      chainId: ChainId.TRON_MAINNET,
      chainKey: ChainKey.TRON_MAINNET,
      trackedAddress: matchedTransaction.trackedAddress,
    };
    const alreadyProcessed: boolean =
      await this.processedEventsRepository.hasProcessed(processedKey);

    if (alreadyProcessed) {
      return;
    }

    const classifiedEvent: ClassifiedEvent = this.classifyMatchedTransaction(matchedTransaction);
    this.logInfo(
      `processMatchedTransaction classified eventType=${classifiedEvent.eventType} txHash=${matchedTransaction.txHash} address=${matchedTransaction.trackedAddress}`,
    );
    const occurredAt: Date =
      matchedTransaction.blockTimestampSec !== null
        ? new Date(matchedTransaction.blockTimestampSec * 1000)
        : new Date();

    await this.walletEventsRepository.saveEvent({
      event: classifiedEvent,
      occurredAt,
    });
    await this.processedEventsRepository.markProcessed(processedKey);
    await this.alertDispatcherService.dispatch(classifiedEvent);
    this.logDebug(`processMatchedTransaction dispatched txHash=${matchedTransaction.txHash}`);
  }

  private classifyMatchedTransaction(matchedTransaction: TronMatchedTransaction): ClassifiedEvent {
    const direction: EventDirection =
      matchedTransaction.trackedAddress === matchedTransaction.txFrom
        ? EventDirection.OUT
        : matchedTransaction.txTo === matchedTransaction.trackedAddress
          ? EventDirection.IN
          : EventDirection.UNKNOWN;
    const counterpartyAddress: string | null =
      direction === EventDirection.OUT ? matchedTransaction.txTo : matchedTransaction.txFrom;

    return {
      chainId: ChainId.TRON_MAINNET,
      txHash: matchedTransaction.txHash,
      logIndex: 0,
      trackedAddress: matchedTransaction.trackedAddress,
      eventType: ClassifiedEventType.TRANSFER,
      direction,
      contractAddress: null,
      tokenAddress: null,
      tokenSymbol: 'TRX',
      tokenDecimals: 6,
      tokenAmountRaw: null,
      valueFormatted: null,
      counterpartyAddress,
      dex: null,
      pair: null,
    };
  }

  private logInfo(message: string): void {
    this.logger.log(`${TronChainStreamService.LOG_PREFIX} ${message}`);
  }

  private logWarn(message: string): void {
    this.logger.warn(`${TronChainStreamService.LOG_PREFIX} ${message}`);
  }

  private logDebug(message: string): void {
    this.logger.debug(`${TronChainStreamService.LOG_PREFIX} ${message}`);
  }

  private startHeartbeat(): void {
    const configuredIntervalSec: number | undefined =
      this.appConfigService.chainHeartbeatIntervalSec;
    const intervalSec: number =
      typeof configuredIntervalSec === 'number' && configuredIntervalSec > 0
        ? configuredIntervalSec
        : TronChainStreamService.DEFAULT_HEARTBEAT_INTERVAL_SEC;
    const intervalMs: number = intervalSec * 1000;

    this.heartbeatTimer = setInterval((): void => {
      const lag: number | null =
        this.lastObservedBlockNumber !== null && this.lastProcessedBlockNumber !== null
          ? this.lastObservedBlockNumber - this.lastProcessedBlockNumber
          : null;
      const backoffMs: number = this.providerFailoverService.getCurrentBackoffMs(
        ChainKey.TRON_MAINNET,
      );

      this.logInfo(
        `heartbeat observedBlock=${this.lastObservedBlockNumber ?? 'n/a'} processedBlock=${this.lastProcessedBlockNumber ?? 'n/a'} lag=${lag ?? 'n/a'} queueSize=${this.blockQueue.length} backoffMs=${backoffMs}`,
      );
    }, intervalMs);

    this.heartbeatTimer.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === null) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
