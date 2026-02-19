import { Inject, Injectable } from '@nestjs/common';

import { SolanaEventClassifierService } from './processors/solana-event-classifier.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { ChainId, type ClassifiedEvent } from '../../../common/interfaces/chain.types';
import { AppConfigService } from '../../../config/app-config.service';
import { ChainCheckpointsRepository } from '../../../database/repositories/chain-checkpoints.repository';
import { ProcessedEventsRepository } from '../../../database/repositories/processed-events.repository';
import { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import {
  type IBaseChainStreamDependencies,
  type IChainStreamConfig,
  type IMatchedTransaction,
} from '../../blockchain/base/base-chain-stream.interfaces';
import { BaseChainStreamService } from '../../blockchain/base/base-chain-stream.service';
import type {
  IBlockEnvelope,
  IReceiptEnvelope,
} from '../../blockchain/base/block-stream.interfaces';
import type { IClassificationContextDto } from '../../blockchain/base/chain-classifier.interfaces';
import type { ISubscriptionHandle } from '../../blockchain/base/rpc-adapter.interfaces';
import { ProviderFailoverService } from '../../blockchain/factory/provider-failover.service';
import { AlertDispatcherService } from '../../whales/services/alert-dispatcher.service';

@Injectable()
export class SolanaChainStreamServiceDependencies implements IBaseChainStreamDependencies {
  @Inject(AppConfigService)
  public readonly appConfigService!: AppConfigService;

  @Inject(ProviderFailoverService)
  public readonly providerFailoverService!: ProviderFailoverService;

  @Inject(ChainCheckpointsRepository)
  public readonly chainCheckpointsRepository!: ChainCheckpointsRepository;

  @Inject(SubscriptionsRepository)
  public readonly subscriptionsRepository!: SubscriptionsRepository;

  @Inject(ProcessedEventsRepository)
  public readonly processedEventsRepository!: ProcessedEventsRepository;

  @Inject(WalletEventsRepository)
  public readonly walletEventsRepository!: WalletEventsRepository;

  @Inject(AlertDispatcherService)
  public readonly alertDispatcherService!: AlertDispatcherService;

  @Inject(SolanaEventClassifierService)
  public readonly solanaEventClassifierService!: SolanaEventClassifierService;
}

@Injectable()
export class SolanaChainStreamService extends BaseChainStreamService {
  private static readonly CHAIN_CONFIG: IChainStreamConfig = {
    logPrefix: '[SOL]',
    chainKey: ChainKey.SOLANA_MAINNET,
    chainId: ChainId.SOLANA_MAINNET,
    defaultHeartbeatIntervalSec: 60,
  };

  public constructor(dependencies: SolanaChainStreamServiceDependencies) {
    const baseDependencies: IBaseChainStreamDependencies = {
      providerFailoverService: dependencies.providerFailoverService,
      chainCheckpointsRepository: dependencies.chainCheckpointsRepository,
      subscriptionsRepository: dependencies.subscriptionsRepository,
      processedEventsRepository: dependencies.processedEventsRepository,
      walletEventsRepository: dependencies.walletEventsRepository,
      alertDispatcherService: dependencies.alertDispatcherService,
    };
    super(baseDependencies);
    this.appConfigService = dependencies.appConfigService;
    this.solanaEventClassifierService = dependencies.solanaEventClassifierService;
  }

  private readonly appConfigService: AppConfigService;
  private readonly solanaEventClassifierService: SolanaEventClassifierService;

  protected getConfig(): IChainStreamConfig {
    return SolanaChainStreamService.CHAIN_CONFIG;
  }

  protected isWatcherEnabled(): boolean {
    return this.appConfigService.solanaWatcherEnabled;
  }

  protected getQueueMax(): number {
    return this.appConfigService.chainSolanaQueueMax;
  }

  protected getCatchupBatch(): number {
    return this.appConfigService.chainSolanaCatchupBatch;
  }

  protected getHeartbeatIntervalSec(): number {
    return this.appConfigService.chainHeartbeatIntervalSec;
  }

  protected getReorgConfirmations(): number {
    return 0;
  }

  protected async fetchBlockEnvelope(blockNumber: number): Promise<IBlockEnvelope | null> {
    return this.providerFailoverService.executeForChain(
      ChainKey.SOLANA_MAINNET,
      (provider): Promise<IBlockEnvelope | null> => provider.getBlockEnvelope(blockNumber),
    );
  }

  protected async fetchLatestBlockNumber(): Promise<number> {
    return this.providerFailoverService.executeForChain(
      ChainKey.SOLANA_MAINNET,
      (provider): Promise<number> => provider.getLatestBlockNumber(),
    );
  }

  protected async subscribeToBlocks(
    handler: (blockNumber: number) => Promise<void>,
  ): Promise<ISubscriptionHandle> {
    return this.providerFailoverService.executeForChain(ChainKey.SOLANA_MAINNET, (provider) =>
      provider.subscribeBlocks(handler),
    );
  }

  protected async resolveTrackedAddresses(): Promise<readonly string[]> {
    return this.subscriptionsRepository.listTrackedAddresses(ChainKey.SOLANA_MAINNET);
  }

  protected matchTransaction(
    txFrom: string,
    txTo: string | null,
    trackedAddresses: readonly string[],
  ): string | null {
    for (const address of trackedAddresses) {
      if (txFrom === address) {
        return address;
      }

      if (txTo !== null && txTo === address) {
        return address;
      }
    }

    return null;
  }

  protected async classifyTransaction(
    matched: IMatchedTransaction,
  ): Promise<ClassifiedEvent | null> {
    const receiptEnvelope: IReceiptEnvelope | null =
      await this.providerFailoverService.executeForChain(
        ChainKey.SOLANA_MAINNET,
        (provider): Promise<IReceiptEnvelope | null> => provider.getReceiptEnvelope(matched.txHash),
      );

    const context: IClassificationContextDto = {
      chainId: ChainId.SOLANA_MAINNET,
      txHash: matched.txHash,
      trackedAddress: matched.trackedAddress,
      txFrom: matched.txFrom,
      txTo: matched.txTo,
      receiptEnvelope,
    };

    return this.solanaEventClassifierService.classify(context).event;
  }
}
