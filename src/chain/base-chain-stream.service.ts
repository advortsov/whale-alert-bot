import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { ClassifiedEventType, type ClassifiedEvent } from './chain.types';
import type { ProviderFailoverService } from './providers/provider-failover.service';
import type { AlertDispatcherService } from '../alerts/alert-dispatcher.service';
import type { ChainKey } from '../core/chains/chain-key.interfaces';
import type { BlockEnvelope, TransactionEnvelope } from '../core/ports/rpc/block-stream.interfaces';
import type { ISubscriptionHandle } from '../core/ports/rpc/rpc-adapter.interfaces';
import { QueueOverflowPolicy } from '../core/ports/rpc/stream-policy.interfaces';
import type { ChainCheckpointsRepository } from '../storage/repositories/chain-checkpoints.repository';
import type { ProcessedEventsRepository } from '../storage/repositories/processed-events.repository';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { WalletEventsRepository } from '../storage/repositories/wallet-events.repository';

export interface ChainStreamConfig {
  readonly logPrefix: string;
  readonly chainKey: ChainKey;
  readonly chainId: number;
  readonly defaultHeartbeatIntervalSec: number;
}

export interface MatchedTransaction {
  readonly txHash: string;
  readonly txFrom: string;
  readonly txTo: string | null;
  readonly trackedAddress: string;
  readonly blockTimestampSec: number | null;
}

/**
 * Базовый оркестратор для chain stream pipeline.
 * Chain-specific адаптеры наследуют и реализуют abstract-методы.
 */
export abstract class BaseChainStreamService implements OnModuleInit, OnModuleDestroy {
  protected readonly logger: Logger;
  protected readonly blockQueue: number[] = [];
  private subscriptionHandle: ISubscriptionHandle | null = null;
  private isProcessingQueue: boolean = false;
  private lastObservedBlockNumber: number | null = null;
  private lastProcessedBlockNumber: number | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isDegradationMode: boolean = false;

  protected constructor(
    protected readonly providerFailoverService: ProviderFailoverService,
    protected readonly chainCheckpointsRepository: ChainCheckpointsRepository,
    protected readonly subscriptionsRepository: SubscriptionsRepository,
    protected readonly processedEventsRepository: ProcessedEventsRepository,
    protected readonly walletEventsRepository: WalletEventsRepository,
    protected readonly alertDispatcherService: AlertDispatcherService,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  protected abstract getConfig(): ChainStreamConfig;

  protected abstract isWatcherEnabled(): boolean;

  protected abstract getQueueMax(): number;

  protected abstract getCatchupBatch(): number;

  protected abstract getHeartbeatIntervalSec(): number;

  protected abstract getReorgConfirmations(): number;

  /** Fetch block envelope via provider failover for this chain. */
  protected abstract fetchBlockEnvelope(blockNumber: number): Promise<BlockEnvelope | null>;

  /** Fetch latest block number via provider failover for this chain. */
  protected abstract fetchLatestBlockNumber(): Promise<number>;

  /** Subscribe to new blocks via provider failover for this chain. */
  protected abstract subscribeToBlocks(
    handler: (blockNumber: number) => Promise<void>,
  ): Promise<ISubscriptionHandle>;

  /**
   * Classify a matched transaction and return a ClassifiedEvent, or null if UNKNOWN.
   * Chain adapters fetch receipts and run their classifier inside this method.
   */
  protected abstract classifyTransaction(
    matched: MatchedTransaction,
  ): Promise<ClassifiedEvent | null>;

  /** Resolve tracked addresses for this chain. Returns addresses in canonical form. */
  protected abstract resolveTrackedAddresses(): Promise<readonly string[]>;

  /**
   * Match transaction against tracked addresses.
   * Returns the tracked address if matched, null otherwise.
   */
  protected abstract matchTransaction(
    txFrom: string,
    txTo: string | null,
    trackedAddresses: readonly string[],
  ): string | null;

  /** Hook called after successful init. Override to add chain-specific startup logic. */
  protected async onChainInit(): Promise<void> {
    // default no-op
  }

  /** Hook called on each runtime snapshot update. Override to publish telemetry. */
  protected onSnapshotUpdated(_snapshot: ChainRuntimeSnapshot): void {
    // default no-op
  }

  public async onModuleInit(): Promise<void> {
    const config = this.getConfig();

    if (!this.isWatcherEnabled()) {
      this.logInfo(`${config.logPrefix} watcher is disabled by config.`);
      this.publishSnapshot();
      return;
    }

    await this.onChainInit();
    await this.recoverFromCheckpoint();

    this.subscriptionHandle = await this.subscribeToBlocks(
      async (blockNumber: number): Promise<void> => {
        const finalizedBlockNumber: number | null = this.resolveFinalizedBlockNumber(blockNumber);

        if (finalizedBlockNumber === null) {
          return;
        }

        this.enqueueBlock(finalizedBlockNumber);
      },
    );

    this.startHeartbeat();
    this.publishSnapshot();
    this.logInfo(`${config.logPrefix} watcher subscribed to new blocks.`);
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopHeartbeat();

    if (this.subscriptionHandle !== null) {
      await this.subscriptionHandle.stop();
      this.subscriptionHandle = null;
    }
  }

  private async recoverFromCheckpoint(): Promise<void> {
    const config = this.getConfig();
    const latestBlockNumber: number = await this.fetchLatestBlockNumber();
    const checkpointBlockNumber: number | null =
      await this.chainCheckpointsRepository.getLastProcessedBlock(config.chainKey);

    if (checkpointBlockNumber === null) {
      return;
    }

    this.lastProcessedBlockNumber = checkpointBlockNumber;

    const confirmations: number = this.getReorgConfirmations();
    const finalizedLatestBlock: number = Math.max(latestBlockNumber - confirmations, 0);

    if (finalizedLatestBlock <= checkpointBlockNumber) {
      return;
    }

    const maxBackfillBlocks: number = this.getCatchupBatch();
    const missedBlocks: number = finalizedLatestBlock - checkpointBlockNumber;

    if (missedBlocks > maxBackfillBlocks) {
      const skippedBlocks: number = missedBlocks - maxBackfillBlocks;
      this.logWarn(
        `bounded catchup activated checkpoint=${checkpointBlockNumber} latest=${finalizedLatestBlock} batch=${maxBackfillBlocks} skipped=${skippedBlocks}`,
      );
    }

    const backfillFromBlock: number = Math.max(
      checkpointBlockNumber + 1,
      finalizedLatestBlock - maxBackfillBlocks + 1,
    );

    for (
      let blockNumber: number = backfillFromBlock;
      blockNumber <= finalizedLatestBlock;
      blockNumber += 1
    ) {
      this.enqueueBlock(blockNumber);
    }
  }

  private resolveFinalizedBlockNumber(observedBlockNumber: number): number | null {
    const confirmations: number = this.getReorgConfirmations();

    if (confirmations === 0) {
      return observedBlockNumber;
    }

    const finalizedBlockNumber: number = observedBlockNumber - confirmations;

    if (finalizedBlockNumber <= 0) {
      return null;
    }

    return finalizedBlockNumber;
  }

  protected enqueueBlock(blockNumber: number): void {
    this.lastObservedBlockNumber = blockNumber;

    if (this.lastProcessedBlockNumber !== null && blockNumber <= this.lastProcessedBlockNumber) {
      return;
    }

    if (this.blockQueue.includes(blockNumber)) {
      return;
    }

    const queueMax: number = this.getQueueMax();

    if (this.blockQueue.length >= queueMax) {
      this.applyQueueOverflowPolicy(blockNumber);
    } else {
      this.blockQueue.push(blockNumber);
    }

    if (!this.isProcessingQueue) {
      void this.processQueue();
    }

    this.tryExitDegradationMode();
    this.publishSnapshot();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;
    const config = this.getConfig();

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
            config.chainKey,
            config.chainId,
            blockNumber,
          );
          this.tryExitDegradationMode();
          this.publishSnapshot();
        } catch (error: unknown) {
          const errorMessage: string = error instanceof Error ? error.message : String(error);
          this.logWarn(`processBlock failed block=${blockNumber} reason=${errorMessage}`);
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
    const trackedAddresses: readonly string[] = await this.resolveTrackedAddresses();

    if (trackedAddresses.length === 0) {
      return;
    }

    const blockEnvelope: BlockEnvelope | null = await this.fetchBlockEnvelope(blockNumber);

    if (blockEnvelope === null) {
      return;
    }

    const matchedTransactions: readonly MatchedTransaction[] = this.collectMatchedTransactions(
      blockEnvelope.transactions,
      trackedAddresses,
      blockEnvelope.timestampSec,
    );

    this.logDebug(
      `processBlock block=${blockNumber} txCount=${blockEnvelope.transactions.length} matchedCount=${matchedTransactions.length}`,
    );

    if (matchedTransactions.length === 0) {
      return;
    }

    for (const matched of matchedTransactions) {
      await this.processMatchedTransaction(matched);
    }
  }

  private collectMatchedTransactions(
    transactions: readonly TransactionEnvelope[],
    trackedAddresses: readonly string[],
    blockTimestampSec: number | null,
  ): readonly MatchedTransaction[] {
    const result: MatchedTransaction[] = [];

    for (const transaction of transactions) {
      const matchedAddress: string | null = this.matchTransaction(
        transaction.from,
        transaction.to,
        trackedAddresses,
      );

      if (matchedAddress === null) {
        continue;
      }

      result.push({
        txHash: transaction.hash,
        txFrom: transaction.from,
        txTo: transaction.to,
        trackedAddress: matchedAddress,
        blockTimestampSec,
      });
    }

    return result;
  }

  private async processMatchedTransaction(matched: MatchedTransaction): Promise<void> {
    const config = this.getConfig();
    this.logDebug(
      `processMatchedTransaction start txHash=${matched.txHash} address=${matched.trackedAddress}`,
    );

    const processedKey = {
      txHash: matched.txHash,
      logIndex: 0,
      chainId: config.chainId,
      chainKey: config.chainKey,
      trackedAddress: matched.trackedAddress,
    };

    const alreadyProcessed: boolean =
      await this.processedEventsRepository.hasProcessed(processedKey);

    if (alreadyProcessed) {
      return;
    }

    const classifiedEvent: ClassifiedEvent | null = await this.classifyTransaction(matched);

    if (classifiedEvent === null || classifiedEvent.eventType === ClassifiedEventType.UNKNOWN) {
      return;
    }

    this.logInfo(
      `processMatchedTransaction classified eventType=${classifiedEvent.eventType} txHash=${matched.txHash} address=${matched.trackedAddress}`,
    );

    const occurredAt: Date =
      matched.blockTimestampSec !== null ? new Date(matched.blockTimestampSec * 1000) : new Date();

    await this.walletEventsRepository.saveEvent({
      event: classifiedEvent,
      occurredAt,
    });
    await this.processedEventsRepository.markProcessed(processedKey);
    await this.alertDispatcherService.dispatch(classifiedEvent);
    this.logDebug(`processMatchedTransaction dispatched txHash=${matched.txHash}`);
  }

  private applyQueueOverflowPolicy(blockNumber: number): void {
    const config = this.getConfig();
    const queueMax: number = this.getQueueMax();
    const retainedWindowSize: number = Math.max(Math.floor(queueMax * 0.3), 10);
    const combinedQueue: number[] = [...this.blockQueue, blockNumber];
    const retainedQueue: number[] = combinedQueue.slice(-retainedWindowSize);
    const droppedCount: number = combinedQueue.length - retainedQueue.length;
    const droppedFrom: number = combinedQueue[0] ?? blockNumber;
    const droppedTo: number = combinedQueue[droppedCount - 1] ?? blockNumber;

    this.blockQueue.splice(0, this.blockQueue.length, ...retainedQueue);

    if (!this.isDegradationMode) {
      this.isDegradationMode = true;
      this.logWarn(
        `degradation_mode_enter chain=${config.chainKey} policy=${QueueOverflowPolicy.KEEP_TAIL_WINDOW} droppedRange=${droppedFrom}..${droppedTo} retainedRange=${retainedQueue[0] ?? blockNumber}..${retainedQueue[retainedQueue.length - 1] ?? blockNumber}`,
      );
    }

    this.logWarn(
      `queue overflow dropped=${droppedCount} retainedWindow=${retainedWindowSize} latest=${blockNumber}`,
    );
  }

  private tryExitDegradationMode(): void {
    if (!this.isDegradationMode) {
      return;
    }

    const config = this.getConfig();
    const queueMax: number = this.getQueueMax();
    const queueUsageRatio: number = this.blockQueue.length / queueMax;

    if (queueUsageRatio > 0.25) {
      return;
    }

    const lag: number | null = this.resolveLag();

    if (lag !== null && lag > Math.floor(queueMax * 0.5)) {
      return;
    }

    this.isDegradationMode = false;
    this.logInfo(`degradation_mode_exit chain=${config.chainKey}`);
  }

  private startHeartbeat(): void {
    const config = this.getConfig();
    const intervalSec: number = this.getHeartbeatIntervalSec();
    const intervalMs: number = intervalSec * 1000;

    this.heartbeatTimer = setInterval((): void => {
      const lag: number | null = this.resolveLag();
      const backoffMs: number = this.providerFailoverService.getCurrentBackoffMs(config.chainKey);
      const queueMax: number = this.getQueueMax();
      const queueUsedPercent: number = Math.round((this.blockQueue.length / queueMax) * 100);
      const catchupDebt: number = this.resolveCatchupDebt(lag);

      this.logInfo(
        `heartbeat observedBlock=${this.lastObservedBlockNumber ?? 'n/a'} processedBlock=${this.lastProcessedBlockNumber ?? 'n/a'} lag=${lag ?? 'n/a'} queueSize=${this.blockQueue.length}/${queueMax} queueUsedPct=${queueUsedPercent} catchupDebt=${catchupDebt} degradationMode=${this.isDegradationMode ? 'on' : 'off'} backoffMs=${backoffMs}`,
      );
      this.publishSnapshot();
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

  private resolveLag(): number | null {
    if (this.lastObservedBlockNumber === null || this.lastProcessedBlockNumber === null) {
      return null;
    }

    return this.lastObservedBlockNumber - this.lastProcessedBlockNumber;
  }

  private resolveCatchupDebt(lag: number | null): number {
    if (lag === null) {
      return 0;
    }

    return Math.max(lag - this.blockQueue.length, 0);
  }

  private publishSnapshot(): void {
    const lag: number | null = this.resolveLag();
    const config = this.getConfig();

    this.onSnapshotUpdated({
      chainKey: config.chainKey,
      observedBlock: this.lastObservedBlockNumber,
      processedBlock: this.lastProcessedBlockNumber,
      lag,
      queueSize: this.blockQueue.length,
      backoffMs: this.providerFailoverService.getCurrentBackoffMs(config.chainKey),
      isDegradationMode: this.isDegradationMode,
      updatedAtIso: new Date().toISOString(),
    });
  }

  protected logInfo(message: string): void {
    this.logger.log(`${this.getConfig().logPrefix} ${message}`);
  }

  protected logWarn(message: string): void {
    this.logger.warn(`${this.getConfig().logPrefix} ${message}`);
  }

  protected logDebug(message: string): void {
    this.logger.debug(`${this.getConfig().logPrefix} ${message}`);
  }
}

export interface ChainRuntimeSnapshot {
  readonly chainKey: ChainKey;
  readonly observedBlock: number | null;
  readonly processedBlock: number | null;
  readonly lag: number | null;
  readonly queueSize: number;
  readonly backoffMs: number;
  readonly isDegradationMode: boolean;
  readonly updatedAtIso: string;
}
