import { Injectable } from '@nestjs/common';

import { SolanaEventClassifierService } from './solana-event-classifier.service';
import { AlertDispatcherService } from '../../alerts/alert-dispatcher.service';
import {
  BaseChainStreamService,
  type IChainStreamConfig,
  type IMatchedTransaction,
} from '../../chain/base-chain-stream.service';
import { ChainId, type ClassifiedEvent } from '../../chain/chain.types';
import { ProviderFailoverService } from '../../chain/providers/provider-failover.service';
import { AppConfigService } from '../../config/app-config.service';
import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type { IClassificationContextDto } from '../../core/ports/classification/chain-classifier.interfaces';
import type {
  IBlockEnvelope,
  IReceiptEnvelope,
} from '../../core/ports/rpc/block-stream.interfaces';
import type { ISubscriptionHandle } from '../../core/ports/rpc/rpc-adapter.interfaces';
import { ChainCheckpointsRepository } from '../../storage/repositories/chain-checkpoints.repository';
import { ProcessedEventsRepository } from '../../storage/repositories/processed-events.repository';
import { SubscriptionsRepository } from '../../storage/repositories/subscriptions.repository';
import { WalletEventsRepository } from '../../storage/repositories/wallet-events.repository';

@Injectable()
export class SolanaChainStreamService extends BaseChainStreamService {
  private static readonly CHAIN_CONFIG: IChainStreamConfig = {
    logPrefix: '[SOL]',
    chainKey: ChainKey.SOLANA_MAINNET,
    chainId: ChainId.SOLANA_MAINNET,
    defaultHeartbeatIntervalSec: 60,
  };

  public constructor(
    private readonly appConfigService: AppConfigService,
    providerFailoverService: ProviderFailoverService,
    chainCheckpointsRepository: ChainCheckpointsRepository,
    subscriptionsRepository: SubscriptionsRepository,
    processedEventsRepository: ProcessedEventsRepository,
    walletEventsRepository: WalletEventsRepository,
    alertDispatcherService: AlertDispatcherService,
    private readonly solanaEventClassifierService: SolanaEventClassifierService,
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
