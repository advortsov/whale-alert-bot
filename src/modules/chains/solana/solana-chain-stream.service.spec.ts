import { describe, expect, it, vi } from 'vitest';

import { SolanaEventClassifierService } from './processors/solana-event-classifier.service';
import { SolanaChainStreamService } from './solana-chain-stream.service';
import type { AlertDispatcherService } from '../../../alerts/alert-dispatcher.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../../common/interfaces/chain.types';
import type { AppConfigService } from '../../../config/app-config.service';
import type { ChainCheckpointsRepository } from '../../../database/repositories/chain-checkpoints.repository';
import type { ProcessedEventsRepository } from '../../../database/repositories/processed-events.repository';
import type { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import type { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import type {
  IBlockEnvelope,
  IReceiptEnvelope,
  ITransactionEnvelope,
} from '../../blockchain/base/block-stream.interfaces';
import type {
  ISubscriptionHandle,
  IProviderHealth,
  ProviderOperation,
} from '../../blockchain/base/rpc-adapter.interfaces';
import type { ProviderFailoverService } from '../../blockchain/factory/provider-failover.service';

class SolanaProviderStub {
  public blockHandler: ((blockNumber: number) => Promise<void>) | null = null;
  public latestBlockNumber: number = 1000;
  private readonly blockByNumber: Map<number, IBlockEnvelope> = new Map<number, IBlockEnvelope>();
  private readonly receiptByHash: Map<string, IReceiptEnvelope> = new Map<
    string,
    IReceiptEnvelope
  >();

  public setBlock(blockNumber: number, block: IBlockEnvelope): void {
    this.blockByNumber.set(blockNumber, block);
  }

  public setReceipt(txHash: string, receipt: IReceiptEnvelope): void {
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

  public async getBlockEnvelope(blockNumber: number): Promise<IBlockEnvelope | null> {
    return this.blockByNumber.get(blockNumber) ?? null;
  }

  public async getReceiptEnvelope(txHash: string): Promise<IReceiptEnvelope | null> {
    return this.receiptByHash.get(txHash) ?? null;
  }

  public async healthCheck(): Promise<IProviderHealth> {
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
    const transaction: ITransactionEnvelope = {
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
      chainSolanaQueueMax: 20,
      chainSolanaCatchupBatch: 10,
    } as unknown as AppConfigService;
    const solanaEventClassifierService: SolanaEventClassifierService =
      new SolanaEventClassifierService();

    const service: SolanaChainStreamService = new SolanaChainStreamService({
      appConfigService,
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
      solanaEventClassifierService,
    });

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
      chainSolanaQueueMax: 20,
      chainSolanaCatchupBatch: 10,
    } as unknown as AppConfigService;
    const solanaEventClassifierService: SolanaEventClassifierService =
      new SolanaEventClassifierService();

    const service: SolanaChainStreamService = new SolanaChainStreamService({
      appConfigService,
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
      solanaEventClassifierService,
    });

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

  it('applies bounded catchup during checkpoint recovery for solana', async (): Promise<void> => {
    const trackedAddress: string = '11111111111111111111111111111111';
    const providerStub: SolanaProviderStub = new SolanaProviderStub();
    providerStub.latestBlockNumber = 140;

    for (let blockNumber: number = 131; blockNumber <= 140; blockNumber += 1) {
      providerStub.setBlock(blockNumber, {
        number: blockNumber,
        timestampSec: 1_739_400_000,
        transactions: [
          {
            hash: `sol-tx-${String(blockNumber)}`,
            from: trackedAddress,
            to: '22222222222222222222222222222222',
            blockTimestampSec: 1_739_400_000,
          },
        ],
      });
      providerStub.setReceipt(`sol-tx-${String(blockNumber)}`, {
        txHash: `sol-tx-${String(blockNumber)}`,
        logs: [],
      });
    }

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
      getLastProcessedBlock: async (): Promise<number | null> => 100,
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
    const dispatchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const alertDispatcherService: AlertDispatcherService = {
      dispatch: dispatchMock,
    } as unknown as AlertDispatcherService;
    const appConfigService: AppConfigService = {
      solanaWatcherEnabled: true,
      chainBlockQueueMax: 120,
      chainSolanaQueueMax: 120,
      chainSolanaCatchupBatch: 10,
    } as unknown as AppConfigService;
    const solanaEventClassifierService: SolanaEventClassifierService =
      new SolanaEventClassifierService();

    const service: SolanaChainStreamService = new SolanaChainStreamService({
      appConfigService,
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
      solanaEventClassifierService,
    });

    await service.onModuleInit();
    await sleep(80);

    expect(saveEventMock).toHaveBeenCalledTimes(10);
    expect(dispatchMock).toHaveBeenCalledTimes(10);

    await service.onModuleDestroy();
  });
});
