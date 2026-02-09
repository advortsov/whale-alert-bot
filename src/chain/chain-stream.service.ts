import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Log, TransactionReceipt, TransactionResponse } from 'ethers';

import { ChainId, ClassifiedEventType, type ObservedTransaction } from './chain.types';
import { EventClassifierService } from './event-classifier.service';
import { AlertDispatcherService } from '../alerts/alert-dispatcher.service';
import { AppConfigService } from '../config/app-config.service';
import type {
  BlockWithTransactions,
  ISubscriptionHandle,
} from './interfaces/rpc-provider.interface';
import { ProviderFailoverService } from './providers/provider-failover.service';
import { ProviderFactory } from './providers/provider.factory';
import { RuntimeStatusService } from '../runtime/runtime-status.service';
import { ChainCheckpointsRepository } from '../storage/repositories/chain-checkpoints.repository';
import { ProcessedEventsRepository } from '../storage/repositories/processed-events.repository';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';

type MatchedTransaction = {
  readonly txHash: string;
  readonly txFrom: string;
  readonly txTo: string | null;
  readonly trackedAddress: string;
};

@Injectable()
export class ChainStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger = new Logger(ChainStreamService.name);
  private subscriptionHandle: ISubscriptionHandle | null = null;
  private readonly blockQueue: number[] = [];
  private isBlockQueueProcessing: boolean = false;
  private lastObservedBlockNumber: number | null = null;
  private lastProcessedBlockNumber: number | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly providerFactory: ProviderFactory,
    private readonly providerFailoverService: ProviderFailoverService,
    private readonly runtimeStatusService: RuntimeStatusService,
    private readonly chainCheckpointsRepository: ChainCheckpointsRepository,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly processedEventsRepository: ProcessedEventsRepository,
    private readonly eventClassifierService: EventClassifierService,
    private readonly alertDispatcherService: AlertDispatcherService,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.appConfigService.chainWatcherEnabled) {
      this.logger.log('Chain watcher is disabled by config.');
      this.publishRuntimeSnapshot();
      return;
    }

    await this.logStartupProviderChecks();
    await this.recoverFromCheckpoint();

    this.subscriptionHandle = await this.providerFailoverService.execute((provider) =>
      provider.subscribeBlocks(async (blockNumber: number): Promise<void> => {
        const finalizedBlockNumber: number | null = this.resolveFinalizedBlockNumber(blockNumber);

        if (finalizedBlockNumber === null) {
          return;
        }

        this.enqueueBlock(finalizedBlockNumber);
      }),
    );

    this.startHeartbeat();
    this.publishRuntimeSnapshot();
    this.logger.log('Chain watcher subscribed to new Ethereum blocks.');
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopHeartbeat();

    if (this.subscriptionHandle) {
      await this.subscriptionHandle.stop();
      this.subscriptionHandle = null;
    }
  }

  private async recoverFromCheckpoint(): Promise<void> {
    const latestBlockNumber: number = await this.providerFailoverService.execute((provider) =>
      provider.getLatestBlockNumber(),
    );
    const checkpointBlockNumber: number | null =
      await this.chainCheckpointsRepository.getLastProcessedBlock(ChainId.ETHEREUM_MAINNET);

    if (checkpointBlockNumber === null) {
      this.logger.log(
        `checkpoint not found for chain=${String(ChainId.ETHEREUM_MAINNET)} latest=${latestBlockNumber}`,
      );
      return;
    }

    this.lastProcessedBlockNumber = checkpointBlockNumber;

    const finalizedLatestBlock: number = Math.max(
      latestBlockNumber - this.appConfigService.chainReorgConfirmations,
      0,
    );

    if (finalizedLatestBlock <= checkpointBlockNumber) {
      this.logger.log(
        `checkpoint up-to-date checkpoint=${checkpointBlockNumber} latestFinalized=${finalizedLatestBlock}`,
      );
      return;
    }

    const maxBackfillBlocks: number = this.appConfigService.chainBlockQueueMax;
    const backfillFromBlock: number = Math.max(
      checkpointBlockNumber + 1,
      finalizedLatestBlock - maxBackfillBlocks + 1,
    );

    this.logger.log(
      `checkpoint recovery start from=${backfillFromBlock} to=${finalizedLatestBlock} latest=${latestBlockNumber} confirmations=${this.appConfigService.chainReorgConfirmations}`,
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
    const confirmations: number = this.appConfigService.chainReorgConfirmations;
    const finalizedBlockNumber: number = observedBlockNumber - confirmations;

    if (finalizedBlockNumber <= 0) {
      return null;
    }

    return finalizedBlockNumber;
  }

  private enqueueBlock(blockNumber: number): void {
    this.lastObservedBlockNumber = blockNumber;

    if (this.lastProcessedBlockNumber !== null && blockNumber <= this.lastProcessedBlockNumber) {
      this.logger.debug(
        `enqueueBlock skip old block blockNumber=${blockNumber} lastProcessed=${this.lastProcessedBlockNumber}`,
      );
      return;
    }

    if (this.blockQueue.includes(blockNumber)) {
      this.logger.debug(`enqueueBlock skip duplicate blockNumber=${blockNumber}`);
      return;
    }

    if (this.blockQueue.length >= this.appConfigService.chainBlockQueueMax) {
      const droppedCount: number = this.blockQueue.length;
      this.blockQueue.splice(0, this.blockQueue.length, blockNumber);
      this.logger.warn(
        `block queue overflow: dropped=${droppedCount}, retainedLatest=${blockNumber}`,
      );
    } else {
      this.blockQueue.push(blockNumber);
    }

    if (!this.isBlockQueueProcessing) {
      void this.processBlockQueue();
    }

    this.publishRuntimeSnapshot();
  }

  private async processBlockQueue(): Promise<void> {
    if (this.isBlockQueueProcessing) {
      return;
    }

    this.isBlockQueueProcessing = true;

    try {
      while (this.blockQueue.length > 0) {
        const nextBlockNumber: number | undefined = this.blockQueue.shift();

        if (typeof nextBlockNumber !== 'number') {
          continue;
        }

        try {
          await this.processBlock(nextBlockNumber);
          this.lastProcessedBlockNumber = nextBlockNumber;
          await this.chainCheckpointsRepository.saveLastProcessedBlock(
            ChainId.ETHEREUM_MAINNET,
            nextBlockNumber,
          );
          this.publishRuntimeSnapshot();
        } catch (error: unknown) {
          const errorMessage: string = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `processBlockQueue failed blockNumber=${nextBlockNumber} reason=${errorMessage}`,
          );
        }
      }
    } finally {
      this.isBlockQueueProcessing = false;

      if (this.blockQueue.length > 0) {
        void this.processBlockQueue();
      }
    }
  }

  private async processBlock(blockNumber: number): Promise<void> {
    this.logger.debug(`processBlock start blockNumber=${blockNumber}`);
    const trackedAddresses: readonly string[] =
      await this.subscriptionsRepository.listTrackedAddresses();

    if (trackedAddresses.length === 0) {
      this.logger.debug(`processBlock skip no tracked addresses blockNumber=${blockNumber}`);
      return;
    }
    this.logger.debug(
      `processBlock tracked addresses count=${trackedAddresses.length} blockNumber=${blockNumber}`,
    );

    const trackedAddressSet: ReadonlySet<string> = new Set(
      trackedAddresses.map((address: string): string => address.toLowerCase()),
    );

    const block: BlockWithTransactions | null = await this.providerFailoverService.execute(
      (provider) => provider.getBlockWithTransactions(blockNumber),
    );

    if (!block) {
      this.logger.warn(`processBlock block not found blockNumber=${blockNumber}`);
      return;
    }

    const matchedTransactions: readonly MatchedTransaction[] = this.collectMatchedTransactions(
      block.prefetchedTransactions,
      trackedAddressSet,
    );

    this.logger.debug(
      `processBlock loaded blockNumber=${blockNumber} txCount=${block.prefetchedTransactions.length} matchedCount=${matchedTransactions.length}`,
    );

    if (matchedTransactions.length === 0) {
      return;
    }

    await this.processMatchedTransactions(matchedTransactions);
  }

  private collectMatchedTransactions(
    transactions: readonly TransactionResponse[],
    trackedAddressSet: ReadonlySet<string>,
  ): readonly MatchedTransaction[] {
    const matchedTransactions: MatchedTransaction[] = [];

    for (const transaction of transactions) {
      const txFrom: string = transaction.from.toLowerCase();
      const txTo: string | null = transaction.to ? transaction.to.toLowerCase() : null;
      const matchedAddress: string | null = this.matchTrackedAddress(
        txFrom,
        txTo,
        trackedAddressSet,
      );

      if (!matchedAddress) {
        continue;
      }

      matchedTransactions.push({
        txHash: transaction.hash,
        txFrom,
        txTo,
        trackedAddress: matchedAddress,
      });
    }

    return matchedTransactions;
  }

  private async processMatchedTransactions(
    matchedTransactions: readonly MatchedTransaction[],
  ): Promise<void> {
    const concurrency: number = Math.max(this.appConfigService.chainReceiptConcurrency, 1);

    for (let index: number = 0; index < matchedTransactions.length; index += concurrency) {
      const chunk: readonly MatchedTransaction[] = matchedTransactions.slice(
        index,
        index + concurrency,
      );
      await Promise.all(
        chunk.map(async (matchedTransaction: MatchedTransaction): Promise<void> => {
          try {
            await this.processMatchedTransaction(matchedTransaction);
          } catch (error: unknown) {
            const errorMessage: string = error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `processMatchedTransactions failed txHash=${matchedTransaction.txHash} reason=${errorMessage}`,
            );
          }
        }),
      );
    }
  }

  private async processMatchedTransaction(matchedTransaction: MatchedTransaction): Promise<void> {
    this.logger.debug(
      `processMatchedTransaction start txHash=${matchedTransaction.txHash} address=${matchedTransaction.trackedAddress}`,
    );

    const receipt: TransactionReceipt | null = await this.providerFailoverService.execute(
      (provider) => provider.getTransactionReceipt(matchedTransaction.txHash),
    );

    const observedTransaction: ObservedTransaction = {
      chainId: ChainId.ETHEREUM_MAINNET,
      txHash: matchedTransaction.txHash,
      trackedAddress: matchedTransaction.trackedAddress,
      txFrom: matchedTransaction.txFrom,
      txTo: matchedTransaction.txTo,
      logs: this.extractLogs(receipt),
    };

    const classifiedEvent = this.eventClassifierService.classify(observedTransaction);

    if (classifiedEvent.eventType === ClassifiedEventType.UNKNOWN) {
      this.logger.debug(
        `processMatchedTransaction classified UNKNOWN txHash=${matchedTransaction.txHash}`,
      );
      return;
    }

    this.logger.log(
      `processMatchedTransaction classified eventType=${classifiedEvent.eventType} txHash=${matchedTransaction.txHash} address=${matchedTransaction.trackedAddress}`,
    );

    const alreadyProcessed: boolean = await this.processedEventsRepository.hasProcessed({
      txHash: classifiedEvent.txHash,
      logIndex: classifiedEvent.logIndex,
      chainId: classifiedEvent.chainId,
      trackedAddress: classifiedEvent.trackedAddress,
    });

    if (alreadyProcessed) {
      this.logger.debug(
        `processMatchedTransaction skip already processed txHash=${matchedTransaction.txHash}`,
      );
      return;
    }

    await this.processedEventsRepository.markProcessed({
      txHash: classifiedEvent.txHash,
      logIndex: classifiedEvent.logIndex,
      chainId: classifiedEvent.chainId,
      trackedAddress: classifiedEvent.trackedAddress,
    });

    await this.alertDispatcherService.dispatch(classifiedEvent);
    this.logger.debug(`processMatchedTransaction dispatched txHash=${matchedTransaction.txHash}`);
  }

  private matchTrackedAddress(
    txFrom: string,
    txTo: string | null,
    trackedAddressSet: ReadonlySet<string>,
  ): string | null {
    if (trackedAddressSet.has(txFrom)) {
      return txFrom;
    }

    if (txTo && trackedAddressSet.has(txTo)) {
      return txTo;
    }

    return null;
  }

  private extractLogs(
    receipt: TransactionReceipt | null,
  ): readonly ObservedTransaction['logs'][number][] {
    if (!receipt) {
      return [];
    }

    return receipt.logs.map((log: Log): ObservedTransaction['logs'][number] => ({
      address: log.address.toLowerCase(),
      topics: log.topics,
      data: log.data,
      logIndex: log.index,
    }));
  }

  private startHeartbeat(): void {
    const intervalMs: number = this.appConfigService.chainHeartbeatIntervalSec * 1000;

    this.heartbeatTimer = setInterval((): void => {
      const lag: number | null =
        this.lastObservedBlockNumber !== null && this.lastProcessedBlockNumber !== null
          ? this.lastObservedBlockNumber - this.lastProcessedBlockNumber
          : null;
      const currentBackoffMs: number = this.providerFailoverService.getCurrentBackoffMs();
      this.logger.log(
        `heartbeat observedBlock=${this.lastObservedBlockNumber ?? 'n/a'} processedBlock=${this.lastProcessedBlockNumber ?? 'n/a'} lag=${lag ?? 'n/a'} queueSize=${this.blockQueue.length} confirmations=${this.appConfigService.chainReorgConfirmations} backoffMs=${currentBackoffMs}`,
      );
      this.publishRuntimeSnapshot();
    }, intervalMs);

    this.heartbeatTimer.unref();
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private async logStartupProviderChecks(): Promise<void> {
    const primaryProvider = this.providerFactory.createPrimary(ChainId.ETHEREUM_MAINNET);
    const fallbackProvider = this.providerFactory.createFallback(ChainId.ETHEREUM_MAINNET);

    const primaryHealth = await primaryProvider.healthCheck();
    const fallbackHealth = await fallbackProvider.healthCheck();

    this.logger.log(
      `startup rpc smoke-check primary=${primaryHealth.ok ? 'ok' : 'fail'} (${primaryHealth.details}), fallback=${fallbackHealth.ok ? 'ok' : 'fail'} (${fallbackHealth.details})`,
    );
  }

  private publishRuntimeSnapshot(): void {
    const lag: number | null =
      this.lastObservedBlockNumber !== null && this.lastProcessedBlockNumber !== null
        ? this.lastObservedBlockNumber - this.lastProcessedBlockNumber
        : null;

    this.runtimeStatusService.setSnapshot({
      observedBlock: this.lastObservedBlockNumber,
      processedBlock: this.lastProcessedBlockNumber,
      lag,
      queueSize: this.blockQueue.length,
      backoffMs: this.providerFailoverService.getCurrentBackoffMs(),
      confirmations: this.appConfigService.chainReorgConfirmations,
      updatedAtIso: new Date().toISOString(),
    });
  }
}
