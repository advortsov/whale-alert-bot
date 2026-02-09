import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Block, Log, TransactionReceipt, TransactionResponse } from 'ethers';

import { ChainId, ClassifiedEventType, type ObservedTransaction } from './chain.types';
import { EventClassifierService } from './event-classifier.service';
import { AlertDispatcherService } from '../alerts/alert-dispatcher.service';
import { AppConfigService } from '../config/app-config.service';
import type { ISubscriptionHandle } from './interfaces/rpc-provider.interface';
import { ProviderFailoverService } from './providers/provider-failover.service';
import { ProcessedEventsRepository } from '../storage/repositories/processed-events.repository';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';

@Injectable()
export class ChainStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: Logger = new Logger(ChainStreamService.name);
  private subscriptionHandle: ISubscriptionHandle | null = null;

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly providerFailoverService: ProviderFailoverService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly processedEventsRepository: ProcessedEventsRepository,
    private readonly eventClassifierService: EventClassifierService,
    private readonly alertDispatcherService: AlertDispatcherService,
  ) {}

  public async onModuleInit(): Promise<void> {
    if (!this.appConfigService.chainWatcherEnabled) {
      this.logger.log('Chain watcher is disabled by config.');
      return;
    }

    this.subscriptionHandle = await this.providerFailoverService.execute((provider) =>
      provider.subscribeBlocks(
        (blockNumber: number): Promise<void> => this.processBlock(blockNumber),
      ),
    );

    this.logger.log('Chain watcher subscribed to new Ethereum blocks.');
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.subscriptionHandle) {
      await this.subscriptionHandle.stop();
      this.subscriptionHandle = null;
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

    const block: Block | null = await this.providerFailoverService.execute((provider) =>
      provider.getBlock(blockNumber),
    );

    if (!block) {
      this.logger.warn(`processBlock block not found blockNumber=${blockNumber}`);
      return;
    }

    this.logger.debug(
      `processBlock loaded blockNumber=${blockNumber} txCount=${block.transactions.length}`,
    );

    for (const txHash of block.transactions) {
      await this.processTransaction(txHash, trackedAddressSet);
    }
  }

  private async processTransaction(
    txHash: string,
    trackedAddressSet: ReadonlySet<string>,
  ): Promise<void> {
    this.logger.debug(`processTransaction start txHash=${txHash}`);
    const transaction: TransactionResponse | null = await this.providerFailoverService.execute(
      (provider) => provider.getTransaction(txHash),
    );

    if (!transaction) {
      this.logger.debug(`processTransaction skip tx not found txHash=${txHash}`);
      return;
    }

    const txFrom: string = transaction.from.toLowerCase();
    const txTo: string | null = transaction.to ? transaction.to.toLowerCase() : null;

    const matchedAddress: string | null = this.matchTrackedAddress(txFrom, txTo, trackedAddressSet);

    if (!matchedAddress) {
      this.logger.debug(`processTransaction skip unmatched txHash=${txHash}`);
      return;
    }
    this.logger.debug(`processTransaction matched txHash=${txHash} address=${matchedAddress}`);

    const receipt: TransactionReceipt | null = await this.providerFailoverService.execute(
      (provider) => provider.getTransactionReceipt(txHash),
    );

    const observedTransaction: ObservedTransaction = {
      chainId: ChainId.ETHEREUM_MAINNET,
      txHash,
      trackedAddress: matchedAddress,
      txFrom,
      txTo,
      logs: this.extractLogs(receipt),
    };

    const classifiedEvent = this.eventClassifierService.classify(observedTransaction);

    if (classifiedEvent.eventType === ClassifiedEventType.UNKNOWN) {
      this.logger.debug(`processTransaction classified UNKNOWN txHash=${txHash}`);
      return;
    }

    this.logger.log(
      `processTransaction classified eventType=${classifiedEvent.eventType} txHash=${txHash} address=${matchedAddress}`,
    );

    const alreadyProcessed: boolean = await this.processedEventsRepository.hasProcessed({
      txHash: classifiedEvent.txHash,
      logIndex: classifiedEvent.logIndex,
      chainId: classifiedEvent.chainId,
      trackedAddress: classifiedEvent.trackedAddress,
    });

    if (alreadyProcessed) {
      this.logger.debug(`processTransaction skip already processed txHash=${txHash}`);
      return;
    }

    await this.processedEventsRepository.markProcessed({
      txHash: classifiedEvent.txHash,
      logIndex: classifiedEvent.logIndex,
      chainId: classifiedEvent.chainId,
      trackedAddress: classifiedEvent.trackedAddress,
    });

    await this.alertDispatcherService.dispatch(classifiedEvent);
    this.logger.debug(`processTransaction dispatched txHash=${txHash}`);
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
}
