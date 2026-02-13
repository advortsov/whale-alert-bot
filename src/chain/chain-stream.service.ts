import { Injectable } from '@nestjs/common';

import {
  BaseChainStreamService,
  type IChainRuntimeSnapshot,
  type IChainStreamConfig,
  type IMatchedTransaction,
} from './base-chain-stream.service';
import {
  ChainId,
  ClassifiedEventType,
  type ClassifiedEvent,
  type ObservedTransaction,
} from './chain.types';
import { EventClassifierService } from './event-classifier.service';
import { ProviderFailoverService } from './providers/provider-failover.service';
import { ProviderFactory } from './providers/provider.factory';
import { AlertDispatcherService } from '../alerts/alert-dispatcher.service';
import { AppConfigService } from '../config/app-config.service';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import type { IBlockEnvelope, IReceiptEnvelope } from '../core/ports/rpc/block-stream.interfaces';
import type { ISubscriptionHandle } from '../core/ports/rpc/rpc-adapter.interfaces';
import { RuntimeStatusService } from '../runtime/runtime-status.service';
import { ChainCheckpointsRepository } from '../storage/repositories/chain-checkpoints.repository';
import { ProcessedEventsRepository } from '../storage/repositories/processed-events.repository';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import { WalletEventsRepository } from '../storage/repositories/wallet-events.repository';

@Injectable()
export class ChainStreamService extends BaseChainStreamService {
  private static readonly CHAIN_CONFIG: IChainStreamConfig = {
    logPrefix: '[ETH]',
    chainKey: ChainKey.ETHEREUM_MAINNET,
    chainId: ChainId.ETHEREUM_MAINNET,
    defaultHeartbeatIntervalSec: 60,
  };

  public constructor(
    private readonly appConfigService: AppConfigService,
    private readonly providerFactory: ProviderFactory,
    providerFailoverService: ProviderFailoverService,
    private readonly runtimeStatusService: RuntimeStatusService,
    chainCheckpointsRepository: ChainCheckpointsRepository,
    subscriptionsRepository: SubscriptionsRepository,
    processedEventsRepository: ProcessedEventsRepository,
    walletEventsRepository: WalletEventsRepository,
    private readonly eventClassifierService: EventClassifierService,
    alertDispatcherService: AlertDispatcherService,
  ) {
    super(
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
    );
  }

  protected getConfig(): IChainStreamConfig {
    return ChainStreamService.CHAIN_CONFIG;
  }

  protected isWatcherEnabled(): boolean {
    return this.appConfigService.chainWatcherEnabled;
  }

  protected getQueueMax(): number {
    return this.appConfigService.chainBlockQueueMax;
  }

  protected getCatchupBatch(): number {
    return this.appConfigService.chainBlockQueueMax;
  }

  protected getHeartbeatIntervalSec(): number {
    return this.appConfigService.chainHeartbeatIntervalSec;
  }

  protected getReorgConfirmations(): number {
    return this.appConfigService.chainReorgConfirmations;
  }

  protected async fetchBlockEnvelope(blockNumber: number): Promise<IBlockEnvelope | null> {
    return this.providerFailoverService.execute((provider) =>
      provider.getBlockEnvelope(blockNumber),
    );
  }

  protected async fetchLatestBlockNumber(): Promise<number> {
    return this.providerFailoverService.execute((provider) => provider.getLatestBlockNumber());
  }

  protected async subscribeToBlocks(
    handler: (blockNumber: number) => Promise<void>,
  ): Promise<ISubscriptionHandle> {
    return this.providerFailoverService.execute((provider) => provider.subscribeBlocks(handler));
  }

  protected async resolveTrackedAddresses(): Promise<readonly string[]> {
    return this.subscriptionsRepository.listTrackedAddresses(ChainKey.ETHEREUM_MAINNET);
  }

  protected matchTransaction(
    txFrom: string,
    txTo: string | null,
    trackedAddresses: readonly string[],
  ): string | null {
    const txFromLower: string = txFrom.toLowerCase();
    const txToLower: string | null = txTo !== null ? txTo.toLowerCase() : null;

    for (const address of trackedAddresses) {
      const addressLower: string = address.toLowerCase();

      if (txFromLower === addressLower) {
        return address;
      }

      if (txToLower !== null && txToLower === addressLower) {
        return address;
      }
    }

    return null;
  }

  protected async classifyTransaction(
    matched: IMatchedTransaction,
  ): Promise<ClassifiedEvent | null> {
    const receipt: IReceiptEnvelope | null = await this.providerFailoverService.execute(
      (provider) => provider.getReceiptEnvelope(matched.txHash),
    );

    const observedTransaction: ObservedTransaction = {
      chainId: ChainId.ETHEREUM_MAINNET,
      txHash: matched.txHash,
      trackedAddress: matched.trackedAddress,
      txFrom: matched.txFrom,
      txTo: matched.txTo,
      logs: this.extractLogs(receipt),
    };

    const classifiedEvent: ClassifiedEvent =
      this.eventClassifierService.classify(observedTransaction);

    if (classifiedEvent.eventType === ClassifiedEventType.UNKNOWN) {
      return null;
    }

    return classifiedEvent;
  }

  protected override async onChainInit(): Promise<void> {
    await this.logStartupProviderChecks();
  }

  protected override onSnapshotUpdated(snapshot: IChainRuntimeSnapshot): void {
    this.runtimeStatusService.setSnapshot({
      observedBlock: snapshot.observedBlock,
      processedBlock: snapshot.processedBlock,
      lag: snapshot.lag,
      queueSize: snapshot.queueSize,
      backoffMs: snapshot.backoffMs,
      confirmations: this.appConfigService.chainReorgConfirmations,
      updatedAtIso: snapshot.updatedAtIso,
    });
  }

  private extractLogs(
    receipt: IReceiptEnvelope | null,
  ): readonly ObservedTransaction['logs'][number][] {
    if (receipt === null) {
      return [];
    }

    return receipt.logs.map((log): ObservedTransaction['logs'][number] => ({
      address: log.address.toLowerCase(),
      topics: log.topics,
      data: log.data,
      logIndex: log.logIndex,
    }));
  }

  private async logStartupProviderChecks(): Promise<void> {
    const primaryProvider = this.providerFactory.createPrimary(ChainKey.ETHEREUM_MAINNET);
    const fallbackProvider = this.providerFactory.createFallback(ChainKey.ETHEREUM_MAINNET);

    const primaryHealth = await primaryProvider.healthCheck();
    const fallbackHealth = await fallbackProvider.healthCheck();

    this.logInfo(
      `startup rpc smoke-check primary=${primaryHealth.ok ? 'ok' : 'fail'} (${primaryHealth.details}), fallback=${fallbackHealth.ok ? 'ok' : 'fail'} (${fallbackHealth.details})`,
    );
  }
}
