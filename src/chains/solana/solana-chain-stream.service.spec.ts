import { describe, expect, it, vi } from 'vitest';

import { SolanaChainStreamService } from './solana-chain-stream.service';
import type { AlertDispatcherService } from '../../alerts/alert-dispatcher.service';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../chain/chain.types';
import type { ProviderFailoverService } from '../../chain/providers/provider-failover.service';
import type { AppConfigService } from '../../config/app-config.service';
import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type {
  BlockEnvelope,
  ReceiptEnvelope,
  TransactionEnvelope,
} from '../../core/ports/rpc/block-stream.interfaces';
import type {
  ISubscriptionHandle,
  ProviderHealth,
  ProviderOperation,
} from '../../core/ports/rpc/rpc-adapter.interfaces';
import type { ChainCheckpointsRepository } from '../../storage/repositories/chain-checkpoints.repository';
import type { ProcessedEventsRepository } from '../../storage/repositories/processed-events.repository';
import type { SubscriptionsRepository } from '../../storage/repositories/subscriptions.repository';
import type { WalletEventsRepository } from '../../storage/repositories/wallet-events.repository';

class SolanaProviderStub {
  public blockHandler: ((blockNumber: number) => Promise<void>) | null = null;
  public latestBlockNumber: number = 1000;
  private readonly blockByNumber: Map<number, BlockEnvelope> = new Map<number, BlockEnvelope>();
  private readonly receiptByHash: Map<string, ReceiptEnvelope> = new Map<string, ReceiptEnvelope>();

  public setBlock(blockNumber: number, block: BlockEnvelope): void {
    this.blockByNumber.set(blockNumber, block);
  }

  public setReceipt(txHash: string, receipt: ReceiptEnvelope): void {
    this.receiptByHash.set(txHash, receipt);
  }

  public getName(): string {
    return 'solana-provider-stub';
  }

  public async subscribeBlocks(
    handler: (blockNumber: number) => Promise<void>,
  ): Promise<ISubscriptionHandle> {
    this.blockHandler = handler;
    return {
      stop: async (): Promise<void> => undefined,
    };
  }

  public async getLatestBlockNumber(): Promise<number> {
    return this.latestBlockNumber;
  }

  public async getBlockEnvelope(blockNumber: number): Promise<BlockEnvelope | null> {
    return this.blockByNumber.get(blockNumber) ?? null;
  }

  public async getReceiptEnvelope(txHash: string): Promise<ReceiptEnvelope | null> {
    return this.receiptByHash.get(txHash) ?? null;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: 'solana-provider-stub',
      ok: true,
      details: 'ok',
    };
  }

  public async disconnect(): Promise<void> {
    return;
  }
}

const sleep = async (waitMs: number): Promise<void> => {
  await new Promise<void>((resolve: () => void): void => {
    setTimeout((): void => {
      resolve();
    }, waitMs);
  });
};

describe('SolanaChainStreamService', (): void => {
  it('processes matched solana transfer and dispatches alert', async (): Promise<void> => {
    const trackedAddress: string = '11111111111111111111111111111111';
    const providerStub: SolanaProviderStub = new SolanaProviderStub();
    const transaction: TransactionEnvelope = {
      hash: 'sol-tx-1',
      from: trackedAddress,
      to: '22222222222222222222222222222222',
      blockTimestampSec: 1_739_400_000,
    };

    providerStub.setBlock(42, {
      number: 42,
      timestampSec: 1_739_400_000,
      transactions: [transaction],
    });
    providerStub.setReceipt('sol-tx-1', {
      txHash: 'sol-tx-1',
      logs: [
        {
          address: 'solana-log',
          topics: [],
          data: 'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
          logIndex: 0,
        },
      ],
    });

    const executeForChainMock: ReturnType<typeof vi.fn> = vi.fn(
      async <T>(chainKey: ChainKey, operation: ProviderOperation<T>): Promise<T> => {
        expect(chainKey).toBe(ChainKey.SOLANA_MAINNET);
        return operation(providerStub as never);
      },
    );
    const providerFailoverService: ProviderFailoverService = {
      execute: async <T>(operation: ProviderOperation<T>): Promise<T> =>
        operation(providerStub as never),
      executeForChain: executeForChainMock,
      getCurrentBackoffMs: (): number => 0,
    } as unknown as ProviderFailoverService;
    const chainCheckpointsRepository: ChainCheckpointsRepository = {
      getLastProcessedBlock: async (): Promise<number | null> => null,
      saveLastProcessedBlock: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChainCheckpointsRepository;
    const subscriptionsRepository: SubscriptionsRepository = {
      listTrackedAddresses: async (): Promise<readonly string[]> => [trackedAddress],
    } as unknown as SubscriptionsRepository;
    const processedEventsRepository: ProcessedEventsRepository = {
      hasProcessed: async (): Promise<boolean> => false,
      markProcessed: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProcessedEventsRepository;
    const saveEventMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const walletEventsRepository: WalletEventsRepository = {
      saveEvent: saveEventMock,
      listRecentByTrackedAddress: async (): Promise<readonly []> => [],
    } as unknown as WalletEventsRepository;
    const dispatchedEvents: ClassifiedEvent[] = [];
    const alertDispatcherService: AlertDispatcherService = {
      dispatch: async (event: ClassifiedEvent): Promise<void> => {
        dispatchedEvents.push(event);
      },
    } as unknown as AlertDispatcherService;
    const appConfigService: AppConfigService = {
      solanaWatcherEnabled: true,
      chainBlockQueueMax: 20,
    } as unknown as AppConfigService;

    const service: SolanaChainStreamService = new SolanaChainStreamService(
      appConfigService,
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
    );

    await service.onModuleInit();

    if (providerStub.blockHandler === null) {
      throw new Error('Solana block handler was not registered');
    }

    await providerStub.blockHandler(42);
    await sleep(30);

    expect(saveEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0]).toMatchObject({
      chainId: ChainId.SOLANA_MAINNET,
      txHash: 'sol-tx-1',
      eventType: ClassifiedEventType.TRANSFER,
      direction: EventDirection.OUT,
      tokenSymbol: 'SPL',
    });

    await service.onModuleDestroy();
  });

  it('skips already processed solana transaction', async (): Promise<void> => {
    const trackedAddress: string = '11111111111111111111111111111111';
    const providerStub: SolanaProviderStub = new SolanaProviderStub();
    providerStub.setBlock(55, {
      number: 55,
      timestampSec: 1_739_400_000,
      transactions: [
        {
          hash: 'sol-tx-processed',
          from: trackedAddress,
          to: '22222222222222222222222222222222',
          blockTimestampSec: 1_739_400_000,
        },
      ],
    });

    const providerFailoverService: ProviderFailoverService = {
      execute: async <T>(operation: ProviderOperation<T>): Promise<T> =>
        operation(providerStub as never),
      executeForChain: async <T>(
        _chainKey: ChainKey,
        operation: ProviderOperation<T>,
      ): Promise<T> => operation(providerStub as never),
      getCurrentBackoffMs: (): number => 0,
    } as unknown as ProviderFailoverService;
    const chainCheckpointsRepository: ChainCheckpointsRepository = {
      getLastProcessedBlock: async (): Promise<number | null> => null,
      saveLastProcessedBlock: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChainCheckpointsRepository;
    const subscriptionsRepository: SubscriptionsRepository = {
      listTrackedAddresses: async (): Promise<readonly string[]> => [trackedAddress],
    } as unknown as SubscriptionsRepository;
    const processedEventsRepository: ProcessedEventsRepository = {
      hasProcessed: async (): Promise<boolean> => true,
      markProcessed: vi.fn().mockResolvedValue(undefined),
    } as unknown as ProcessedEventsRepository;
    const saveEventMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const walletEventsRepository: WalletEventsRepository = {
      saveEvent: saveEventMock,
      listRecentByTrackedAddress: async (): Promise<readonly []> => [],
    } as unknown as WalletEventsRepository;
    const dispatchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const alertDispatcherService: AlertDispatcherService = {
      dispatch: dispatchMock,
    } as unknown as AlertDispatcherService;
    const appConfigService: AppConfigService = {
      solanaWatcherEnabled: true,
      chainBlockQueueMax: 20,
    } as unknown as AppConfigService;

    const service: SolanaChainStreamService = new SolanaChainStreamService(
      appConfigService,
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
    );

    await service.onModuleInit();

    if (providerStub.blockHandler === null) {
      throw new Error('Solana block handler was not registered');
    }

    await providerStub.blockHandler(55);
    await sleep(30);

    expect(saveEventMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();

    await service.onModuleDestroy();
  });
});
