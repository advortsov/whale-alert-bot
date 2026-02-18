import { describe, expect, it, vi } from 'vitest';

import { TronChainStreamService } from './tron-chain-stream.service';
import { TronEventClassifierService } from './tron-event-classifier.service';
import type { AlertDispatcherService } from '../../alerts/alert-dispatcher.service';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../common/interfaces/chain.types';
import type { AppConfigService } from '../../config/app-config.service';
import type { ChainCheckpointsRepository } from '../../database/repositories/chain-checkpoints.repository';
import type { ProcessedEventsRepository } from '../../database/repositories/processed-events.repository';
import type { SubscriptionsRepository } from '../../database/repositories/subscriptions.repository';
import type { WalletEventsRepository } from '../../database/repositories/wallet-events.repository';
import { TronAddressCodec } from '../../integrations/address/tron/tron-address.codec';
import type {
  IBlockEnvelope,
  IReceiptEnvelope,
} from '../../modules/blockchain/base/block-stream.interfaces';
import type {
  ISubscriptionHandle,
  IProviderHealth,
  ProviderOperation,
} from '../../modules/blockchain/base/rpc-adapter.interfaces';
import type { ProviderFailoverService } from '../../modules/blockchain/factory/provider-failover.service';

class TronProviderStub {
  public blockHandler: ((blockNumber: number) => Promise<void>) | null = null;
  public latestBlockNumber: number = 888_888;
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
    return 'tron-provider-stub';
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
      provider: 'tron-provider-stub',
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

describe('TronChainStreamService', (): void => {
  it('processes matched tron transfer and dispatches alert', async (): Promise<void> => {
    const trackedAddress: string = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
    const providerStub: TronProviderStub = new TronProviderStub();

    providerStub.setBlock(42, {
      number: 42,
      timestampSec: 1_739_500_000,
      transactions: [
        {
          hash: 'tron-tx-1',
          from: trackedAddress,
          to: 'TBGttECXLudhozoRi6j6zk7jjwuHp8ucLL',
          blockTimestampSec: 1_739_500_000,
        },
      ],
    });

    const executeForChainMock: ReturnType<typeof vi.fn> = vi.fn(
      async <T>(chainKey: ChainKey, operation: ProviderOperation<T>): Promise<T> => {
        expect(chainKey).toBe(ChainKey.TRON_MAINNET);
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
      tronWatcherEnabled: true,
      chainBlockQueueMax: 20,
      chainTronQueueMax: 20,
      chainTronCatchupBatch: 10,
    } as unknown as AppConfigService;
    const tronEventClassifierService: TronEventClassifierService = new TronEventClassifierService(
      new TronAddressCodec(),
    );

    const service: TronChainStreamService = new TronChainStreamService({
      appConfigService,
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
      tronEventClassifierService,
    });

    await service.onModuleInit();

    if (providerStub.blockHandler === null) {
      throw new Error('TRON block handler was not registered');
    }

    await providerStub.blockHandler(42);
    await sleep(30);

    expect(saveEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0]).toMatchObject({
      chainId: ChainId.TRON_MAINNET,
      txHash: 'tron-tx-1',
      eventType: ClassifiedEventType.TRANSFER,
      direction: EventDirection.OUT,
      tokenSymbol: 'TRX',
    });

    await service.onModuleDestroy();
  });

  it('skips already processed tron transaction', async (): Promise<void> => {
    const trackedAddress: string = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
    const providerStub: TronProviderStub = new TronProviderStub();
    providerStub.setBlock(50, {
      number: 50,
      timestampSec: 1_739_500_000,
      transactions: [
        {
          hash: 'tron-tx-processed',
          from: trackedAddress,
          to: 'TBGttECXLudhozoRi6j6zk7jjwuHp8ucLL',
          blockTimestampSec: 1_739_500_000,
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
      tronWatcherEnabled: true,
      chainBlockQueueMax: 20,
      chainTronQueueMax: 20,
      chainTronCatchupBatch: 10,
    } as unknown as AppConfigService;
    const tronEventClassifierService: TronEventClassifierService = new TronEventClassifierService(
      new TronAddressCodec(),
    );

    const service: TronChainStreamService = new TronChainStreamService({
      appConfigService,
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
      tronEventClassifierService,
    });

    await service.onModuleInit();

    if (providerStub.blockHandler === null) {
      throw new Error('TRON block handler was not registered');
    }

    await providerStub.blockHandler(50);
    await sleep(30);

    expect(saveEventMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();

    await service.onModuleDestroy();
  });

  it('applies bounded catchup during checkpoint recovery for tron', async (): Promise<void> => {
    const trackedAddress: string = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
    const providerStub: TronProviderStub = new TronProviderStub();
    providerStub.latestBlockNumber = 140;

    for (let blockNumber: number = 131; blockNumber <= 140; blockNumber += 1) {
      providerStub.setBlock(blockNumber, {
        number: blockNumber,
        timestampSec: 1_739_500_000,
        transactions: [
          {
            hash: `tron-tx-${String(blockNumber)}`,
            from: trackedAddress,
            to: 'TBGttECXLudhozoRi6j6zk7jjwuHp8ucLL',
            blockTimestampSec: 1_739_500_000,
          },
        ],
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
      tronWatcherEnabled: true,
      chainBlockQueueMax: 120,
      chainTronQueueMax: 120,
      chainTronCatchupBatch: 10,
    } as unknown as AppConfigService;
    const tronEventClassifierService: TronEventClassifierService = new TronEventClassifierService(
      new TronAddressCodec(),
    );

    const service: TronChainStreamService = new TronChainStreamService({
      appConfigService,
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
      tronEventClassifierService,
    });

    await service.onModuleInit();
    await sleep(80);

    expect(saveEventMock).toHaveBeenCalledTimes(10);
    expect(dispatchMock).toHaveBeenCalledTimes(10);

    await service.onModuleDestroy();
  });
});
