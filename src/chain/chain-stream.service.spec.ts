import { describe, expect, it, vi } from 'vitest';

import { ChainStreamService } from './chain-stream.service';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
  type ObservedTransaction,
} from './chain.types';
import type { EventClassifierService } from './event-classifier.service';
import type { ProviderFailoverService } from './providers/provider-failover.service';
import type { ProviderFactory } from './providers/provider.factory';
import type { AlertDispatcherService } from '../alerts/alert-dispatcher.service';
import type { AppConfigService } from '../config/app-config.service';
import type {
  BlockEnvelope,
  ReceiptEnvelope,
  TransactionEnvelope,
} from '../core/ports/rpc/block-stream.interfaces';
import type {
  ISubscriptionHandle,
  ProviderOperation,
  ProviderHealth,
} from '../core/ports/rpc/rpc-adapter.interfaces';
import type { RuntimeStatusService } from '../runtime/runtime-status.service';
import type { ChainCheckpointsRepository } from '../storage/repositories/chain-checkpoints.repository';
import type { ProcessedEventsRepository } from '../storage/repositories/processed-events.repository';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { WalletEventsRepository } from '../storage/repositories/wallet-events.repository';

class ProviderStub {
  public blockHandler: ((blockNumber: number) => Promise<void>) | null = null;
  public receiptCalls: string[] = [];
  public blockRequestCalls: number[] = [];
  public latestBlockNumber: number = 200;
  private readonly blocks: Map<number, BlockEnvelope> = new Map<number, BlockEnvelope>();

  public setBlock(blockNumber: number, block: BlockEnvelope): void {
    this.blocks.set(blockNumber, block);
  }

  public getName(): string {
    return 'provider-stub';
  }

  public async subscribeBlocks(
    handler: (blockNumber: number) => Promise<void>,
  ): Promise<ISubscriptionHandle> {
    this.blockHandler = handler;

    return {
      stop: async (): Promise<void> => {
        return;
      },
    };
  }

  public async getBlockEnvelope(blockNumber: number): Promise<BlockEnvelope | null> {
    this.blockRequestCalls.push(blockNumber);
    return this.blocks.get(blockNumber) ?? null;
  }

  public async getLatestBlockNumber(): Promise<number> {
    return this.latestBlockNumber;
  }

  public async getReceiptEnvelope(txHash: string): Promise<ReceiptEnvelope | null> {
    this.receiptCalls.push(txHash);

    return {
      txHash,
      logs: [],
    };
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: 'provider-stub',
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

describe('ChainStreamService', (): void => {
  it('uses prefetched block transactions and requests receipts only for matched addresses', async (): Promise<void> => {
    const trackedAddress: string = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const providerStub: ProviderStub = new ProviderStub();
    const txMatchedByFrom: TransactionEnvelope = {
      hash: '0x1',
      from: trackedAddress,
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      blockTimestampSec: 1_739_400_000,
    };
    const txMatchedByTo: TransactionEnvelope = {
      hash: '0x2',
      from: '0xcccccccccccccccccccccccccccccccccccccccc',
      to: trackedAddress,
      blockTimestampSec: 1_739_400_000,
    };
    const txUnmatched: TransactionEnvelope = {
      hash: '0x3',
      from: '0xdddddddddddddddddddddddddddddddddddddddd',
      to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      blockTimestampSec: 1_739_400_000,
    };

    providerStub.setBlock(123, {
      number: 123,
      timestampSec: 1_739_400_000,
      transactions: [txMatchedByFrom, txMatchedByTo, txUnmatched],
    });

    const providerFailoverService: ProviderFailoverService = {
      execute: async <T>(operation: ProviderOperation<T>): Promise<T> => operation(providerStub),
      getCurrentBackoffMs: (): number => 0,
    } as unknown as ProviderFailoverService;
    const providerFactory: ProviderFactory = {
      createPrimary: (): ProviderStub => providerStub,
      createFallback: (): ProviderStub => providerStub,
    } as unknown as ProviderFactory;
    const subscriptionsRepository: SubscriptionsRepository = {
      listTrackedAddresses: async (): Promise<readonly string[]> => [trackedAddress],
    } as unknown as SubscriptionsRepository;
    const chainCheckpointsRepository: ChainCheckpointsRepository = {
      getLastProcessedBlock: async (): Promise<number | null> => null,
      saveLastProcessedBlock: async (): Promise<void> => undefined,
    } as unknown as ChainCheckpointsRepository;
    const processedEventsRepository: ProcessedEventsRepository = {
      hasProcessed: async (): Promise<boolean> => false,
      markProcessed: async (): Promise<void> => undefined,
    } as unknown as ProcessedEventsRepository;
    const saveEvent: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const walletEventsRepository: WalletEventsRepository = {
      saveEvent,
      listRecentByTrackedAddress: async (): Promise<readonly []> => [],
    } as unknown as WalletEventsRepository;
    const eventClassifierService: EventClassifierService = {
      classify: (event: ObservedTransaction): ClassifiedEvent => ({
        chainId: ChainId.ETHEREUM_MAINNET,
        txHash: event.txHash,
        logIndex: 0,
        trackedAddress: event.trackedAddress,
        eventType: ClassifiedEventType.TRANSFER,
        direction: EventDirection.OUT,
        contractAddress: '0x9999999999999999999999999999999999999999',
        tokenAddress: '0x9999999999999999999999999999999999999999',
        tokenSymbol: null,
        tokenDecimals: null,
        tokenAmountRaw: null,
        valueFormatted: null,
        counterpartyAddress: null,
        dex: null,
        pair: null,
      }),
    } as unknown as EventClassifierService;
    const dispatched: ClassifiedEvent[] = [];
    const alertDispatcherService: AlertDispatcherService = {
      dispatch: async (event: ClassifiedEvent): Promise<void> => {
        dispatched.push(event);
      },
    } as unknown as AlertDispatcherService;
    const appConfigService: AppConfigService = {
      chainWatcherEnabled: true,
      chainBlockQueueMax: 20,
      chainReceiptConcurrency: 2,
      chainHeartbeatIntervalSec: 3600,
      chainReorgConfirmations: 0,
    } as unknown as AppConfigService;
    const runtimeStatusService: RuntimeStatusService = {
      setSnapshot: (): void => undefined,
      getSnapshot: () => ({
        observedBlock: null,
        processedBlock: null,
        lag: null,
        queueSize: 0,
        backoffMs: 0,
        confirmations: 0,
        updatedAtIso: null,
      }),
    } as unknown as RuntimeStatusService;

    const service: ChainStreamService = new ChainStreamService(
      appConfigService,
      providerFactory,
      providerFailoverService,
      runtimeStatusService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      eventClassifierService,
      alertDispatcherService,
    );

    await service.onModuleInit();

    if (!providerStub.blockHandler) {
      throw new Error('Block handler was not registered.');
    }

    await providerStub.blockHandler(123);

    for (let attempt: number = 0; attempt < 20; attempt += 1) {
      if (providerStub.receiptCalls.length === 2) {
        break;
      }
      await sleep(10);
    }

    expect(providerStub.receiptCalls).toEqual(['0x1', '0x2']);
    expect(dispatched).toHaveLength(2);
    expect(saveEvent).toHaveBeenCalledTimes(2);

    await service.onModuleDestroy();
  });

  it('processes only finalized block based on reorg confirmations', async (): Promise<void> => {
    const trackedAddress: string = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const providerStub: ProviderStub = new ProviderStub();
    providerStub.setBlock(121, {
      number: 121,
      timestampSec: 1_739_400_000,
      transactions: [
        {
          hash: '0xfinalized',
          from: trackedAddress,
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          blockTimestampSec: 1_739_400_000,
        },
      ],
    });

    const providerFailoverService: ProviderFailoverService = {
      execute: async <T>(operation: ProviderOperation<T>): Promise<T> => operation(providerStub),
      getCurrentBackoffMs: (): number => 0,
    } as unknown as ProviderFailoverService;
    const providerFactory: ProviderFactory = {
      createPrimary: (): ProviderStub => providerStub,
      createFallback: (): ProviderStub => providerStub,
    } as unknown as ProviderFactory;
    const chainCheckpointsRepository: ChainCheckpointsRepository = {
      getLastProcessedBlock: async (): Promise<number | null> => null,
      saveLastProcessedBlock: async (): Promise<void> => undefined,
    } as unknown as ChainCheckpointsRepository;
    const subscriptionsRepository: SubscriptionsRepository = {
      listTrackedAddresses: async (): Promise<readonly string[]> => [trackedAddress],
    } as unknown as SubscriptionsRepository;
    const processedEventsRepository: ProcessedEventsRepository = {
      hasProcessed: async (): Promise<boolean> => false,
      markProcessed: async (): Promise<void> => undefined,
    } as unknown as ProcessedEventsRepository;
    const walletEventsRepository: WalletEventsRepository = {
      saveEvent: async (): Promise<void> => undefined,
      listRecentByTrackedAddress: async (): Promise<readonly []> => [],
    } as unknown as WalletEventsRepository;
    const eventClassifierService: EventClassifierService = {
      classify: (event: ObservedTransaction): ClassifiedEvent => ({
        chainId: ChainId.ETHEREUM_MAINNET,
        txHash: event.txHash,
        logIndex: 0,
        trackedAddress: event.trackedAddress,
        eventType: ClassifiedEventType.TRANSFER,
        direction: EventDirection.OUT,
        contractAddress: '0x9999999999999999999999999999999999999999',
        tokenAddress: '0x9999999999999999999999999999999999999999',
        tokenSymbol: null,
        tokenDecimals: null,
        tokenAmountRaw: null,
        valueFormatted: null,
        counterpartyAddress: null,
        dex: null,
        pair: null,
      }),
    } as unknown as EventClassifierService;
    const alertDispatcherService: AlertDispatcherService = {
      dispatch: async (): Promise<void> => undefined,
    } as unknown as AlertDispatcherService;
    const appConfigService: AppConfigService = {
      chainWatcherEnabled: true,
      chainBlockQueueMax: 20,
      chainReceiptConcurrency: 2,
      chainHeartbeatIntervalSec: 3600,
      chainReorgConfirmations: 2,
    } as unknown as AppConfigService;
    const runtimeStatusService: RuntimeStatusService = {
      setSnapshot: (): void => undefined,
      getSnapshot: () => ({
        observedBlock: null,
        processedBlock: null,
        lag: null,
        queueSize: 0,
        backoffMs: 0,
        confirmations: 0,
        updatedAtIso: null,
      }),
    } as unknown as RuntimeStatusService;

    const service: ChainStreamService = new ChainStreamService(
      appConfigService,
      providerFactory,
      providerFailoverService,
      runtimeStatusService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      eventClassifierService,
      alertDispatcherService,
    );

    await service.onModuleInit();

    if (!providerStub.blockHandler) {
      throw new Error('Block handler was not registered.');
    }

    await providerStub.blockHandler(123);

    for (let attempt: number = 0; attempt < 20; attempt += 1) {
      if (providerStub.blockRequestCalls.includes(121)) {
        break;
      }
      await sleep(10);
    }

    expect(providerStub.blockRequestCalls).toContain(121);

    await service.onModuleDestroy();
  });

  it('replays missed finalized blocks from checkpoint on startup', async (): Promise<void> => {
    const trackedAddress: string = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const providerStub: ProviderStub = new ProviderStub();
    providerStub.latestBlockNumber = 125;
    providerStub.setBlock(121, {
      number: 121,
      timestampSec: 1_739_400_000,
      transactions: [
        {
          hash: '0x121',
          from: trackedAddress,
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          blockTimestampSec: 1_739_400_000,
        },
      ],
    });
    providerStub.setBlock(122, {
      number: 122,
      timestampSec: 1_739_400_000,
      transactions: [
        {
          hash: '0x122',
          from: trackedAddress,
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          blockTimestampSec: 1_739_400_000,
        },
      ],
    });
    providerStub.setBlock(123, {
      number: 123,
      timestampSec: 1_739_400_000,
      transactions: [
        {
          hash: '0x123',
          from: trackedAddress,
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          blockTimestampSec: 1_739_400_000,
        },
      ],
    });

    const saveLastProcessedBlock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const chainCheckpointsRepository: ChainCheckpointsRepository = {
      getLastProcessedBlock: async (): Promise<number | null> => 120,
      saveLastProcessedBlock,
    } as unknown as ChainCheckpointsRepository;
    const providerFailoverService: ProviderFailoverService = {
      execute: async <T>(operation: ProviderOperation<T>): Promise<T> => operation(providerStub),
      getCurrentBackoffMs: (): number => 0,
    } as unknown as ProviderFailoverService;
    const providerFactory: ProviderFactory = {
      createPrimary: (): ProviderStub => providerStub,
      createFallback: (): ProviderStub => providerStub,
    } as unknown as ProviderFactory;
    const subscriptionsRepository: SubscriptionsRepository = {
      listTrackedAddresses: async (): Promise<readonly string[]> => [trackedAddress],
    } as unknown as SubscriptionsRepository;
    const processedEventsRepository: ProcessedEventsRepository = {
      hasProcessed: async (): Promise<boolean> => false,
      markProcessed: async (): Promise<void> => undefined,
    } as unknown as ProcessedEventsRepository;
    const walletEventsRepository: WalletEventsRepository = {
      saveEvent: async (): Promise<void> => undefined,
      listRecentByTrackedAddress: async (): Promise<readonly []> => [],
    } as unknown as WalletEventsRepository;
    const eventClassifierService: EventClassifierService = {
      classify: (event: ObservedTransaction): ClassifiedEvent => ({
        chainId: ChainId.ETHEREUM_MAINNET,
        txHash: event.txHash,
        logIndex: 0,
        trackedAddress: event.trackedAddress,
        eventType: ClassifiedEventType.TRANSFER,
        direction: EventDirection.OUT,
        contractAddress: '0x9999999999999999999999999999999999999999',
        tokenAddress: '0x9999999999999999999999999999999999999999',
        tokenSymbol: null,
        tokenDecimals: null,
        tokenAmountRaw: null,
        valueFormatted: null,
        counterpartyAddress: null,
        dex: null,
        pair: null,
      }),
    } as unknown as EventClassifierService;
    const alertDispatcherService: AlertDispatcherService = {
      dispatch: async (): Promise<void> => undefined,
    } as unknown as AlertDispatcherService;
    const appConfigService: AppConfigService = {
      chainWatcherEnabled: true,
      chainBlockQueueMax: 20,
      chainReceiptConcurrency: 2,
      chainHeartbeatIntervalSec: 3600,
      chainReorgConfirmations: 2,
    } as unknown as AppConfigService;
    const runtimeStatusService: RuntimeStatusService = {
      setSnapshot: (): void => undefined,
      getSnapshot: () => ({
        observedBlock: null,
        processedBlock: null,
        lag: null,
        queueSize: 0,
        backoffMs: 0,
        confirmations: 0,
        updatedAtIso: null,
      }),
    } as unknown as RuntimeStatusService;

    const service: ChainStreamService = new ChainStreamService(
      appConfigService,
      providerFactory,
      providerFailoverService,
      runtimeStatusService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      eventClassifierService,
      alertDispatcherService,
    );

    await service.onModuleInit();

    for (let attempt: number = 0; attempt < 30; attempt += 1) {
      if (
        providerStub.blockRequestCalls.includes(121) &&
        providerStub.blockRequestCalls.includes(122) &&
        providerStub.blockRequestCalls.includes(123)
      ) {
        break;
      }
      await sleep(10);
    }

    expect(providerStub.blockRequestCalls).toContain(121);
    expect(providerStub.blockRequestCalls).toContain(122);
    expect(providerStub.blockRequestCalls).toContain(123);
    expect(saveLastProcessedBlock).toHaveBeenCalled();

    await service.onModuleDestroy();
  });
});
