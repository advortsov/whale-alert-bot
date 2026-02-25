import { Inject, Injectable } from '@nestjs/common';

import { EventClassifierService } from './processors/event-classifier.service';
import { ALERT_DISPATCHER } from '../../../common/interfaces/alerts/alert-dispatcher-port.tokens';
import type { IAlertDispatcher } from '../../../common/interfaces/alerts/alert-dispatcher.interfaces';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import {
  ChainId,
  ClassifiedEventType,
  type ClassifiedEvent,
  type ObservedTransaction,
} from '../../../common/interfaces/chain.types';
import { TOKEN_HISTORICAL_PRICING_PORT } from '../../../common/interfaces/token-pricing/token-pricing-port.tokens';
import type { ITokenHistoricalPricingPort } from '../../../common/interfaces/token-pricing/token-pricing.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import { ChainCheckpointsRepository } from '../../../database/repositories/chain-checkpoints.repository';
import { ProcessedEventsRepository } from '../../../database/repositories/processed-events.repository';
import { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import {
  type IBaseChainStreamDependencies,
  type IChainRuntimeSnapshot,
  type IChainStreamConfig,
  type IMatchedTransaction,
} from '../../blockchain/base/base-chain-stream.interfaces';
import { BaseChainStreamService } from '../../blockchain/base/base-chain-stream.service';
import type {
  IBlockEnvelope,
  IReceiptEnvelope,
} from '../../blockchain/base/block-stream.interfaces';
import type { ISubscriptionHandle } from '../../blockchain/base/rpc-adapter.interfaces';
import { ProviderFailoverService } from '../../blockchain/factory/provider-failover.service';
import { ProviderFactory } from '../../blockchain/factory/provider.factory';
import { RuntimeStatusService } from '../../runtime/runtime-status.service';

@Injectable()
export class ChainStreamServiceDependencies implements IBaseChainStreamDependencies {
  @Inject(AppConfigService)
  public readonly appConfigService!: AppConfigService;

  @Inject(ProviderFactory)
  public readonly providerFactory!: ProviderFactory;

  @Inject(ProviderFailoverService)
  public readonly providerFailoverService!: ProviderFailoverService;

  @Inject(RuntimeStatusService)
  public readonly runtimeStatusService!: RuntimeStatusService;

  @Inject(ChainCheckpointsRepository)
  public readonly chainCheckpointsRepository!: ChainCheckpointsRepository;

  @Inject(SubscriptionsRepository)
  public readonly subscriptionsRepository!: SubscriptionsRepository;

  @Inject(ProcessedEventsRepository)
  public readonly processedEventsRepository!: ProcessedEventsRepository;

  @Inject(WalletEventsRepository)
  public readonly walletEventsRepository!: WalletEventsRepository;

  @Inject(EventClassifierService)
  public readonly eventClassifierService!: EventClassifierService;

  @Inject(ALERT_DISPATCHER)
  public readonly alertDispatcherService!: IAlertDispatcher;

  @Inject(TOKEN_HISTORICAL_PRICING_PORT)
  public readonly tokenHistoricalPricingPort!: ITokenHistoricalPricingPort;
}

@Injectable()
export class ChainStreamService extends BaseChainStreamService {
  private static readonly CHAIN_CONFIG: IChainStreamConfig = {
    logPrefix: '[ETH]',
    chainKey: ChainKey.ETHEREUM_MAINNET,
    chainId: ChainId.ETHEREUM_MAINNET,
    defaultHeartbeatIntervalSec: 60,
  };

  public constructor(dependencies: ChainStreamServiceDependencies) {
    const baseDependencies: IBaseChainStreamDependencies = {
      providerFailoverService: dependencies.providerFailoverService,
      chainCheckpointsRepository: dependencies.chainCheckpointsRepository,
      subscriptionsRepository: dependencies.subscriptionsRepository,
      processedEventsRepository: dependencies.processedEventsRepository,
      walletEventsRepository: dependencies.walletEventsRepository,
      alertDispatcherService: dependencies.alertDispatcherService,
      tokenHistoricalPricingPort: dependencies.tokenHistoricalPricingPort,
    };
    super(baseDependencies);
    this.appConfigService = dependencies.appConfigService;
    this.providerFactory = dependencies.providerFactory;
    this.runtimeStatusService = dependencies.runtimeStatusService;
    this.eventClassifierService = dependencies.eventClassifierService;
  }

  private readonly appConfigService: AppConfigService;
  private readonly providerFactory: ProviderFactory;
  private readonly runtimeStatusService: RuntimeStatusService;
  private readonly eventClassifierService: EventClassifierService;

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
