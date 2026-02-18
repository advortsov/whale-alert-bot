import { describe, expect, it, vi } from 'vitest';

import {
  BaseChainStreamService,
  type IChainRuntimeSnapshot,
  type IChainStreamConfig,
  type IBaseChainStreamDependencies,
  type IMatchedTransaction,
} from './base-chain-stream.service';
import { ChainId, ClassifiedEventType, EventDirection, AssetStandard } from './chain.types';
import type { ClassifiedEvent } from './chain.types';
import type { ProviderFailoverService } from './providers/provider-failover.service';
import type { AlertDispatcherService } from '../alerts/alert-dispatcher.service';
import type { ChainKey } from '../core/chains/chain-key.interfaces';
import type { IBlockEnvelope, IReceiptEnvelope } from '../core/ports/rpc/block-stream.interfaces';
import type {
  ISubscriptionHandle,
  ProviderOperation,
} from '../core/ports/rpc/rpc-adapter.interfaces';
import type { ChainCheckpointsRepository } from '../database/repositories/chain-checkpoints.repository';
import type { ProcessedEventsRepository } from '../database/repositories/processed-events.repository';
import type { SubscriptionsRepository } from '../database/repositories/subscriptions.repository';
import type { WalletEventsRepository } from '../database/repositories/wallet-events.repository';

const TRACKED_ADDRESS: string = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CHAIN_KEY: string = 'ethereum_mainnet';
const CHAIN_CONFIG: IChainStreamConfig = {
  logPrefix: '[TEST]',
  chainKey: CHAIN_KEY as ChainKey,
  chainId: ChainId.ETHEREUM_MAINNET,
  defaultHeartbeatIntervalSec: 60,
};

function makeClassifiedEvent(txHash: string): ClassifiedEvent {
  return {
    chainId: ChainId.ETHEREUM_MAINNET,
    txHash,
    logIndex: 0,
    trackedAddress: TRACKED_ADDRESS,
    eventType: ClassifiedEventType.TRANSFER,
    direction: EventDirection.OUT,
    assetStandard: AssetStandard.NATIVE,
    contractAddress: null,
    tokenAddress: null,
    tokenSymbol: null,
    tokenDecimals: null,
    tokenAmountRaw: null,
    valueFormatted: null,
    counterpartyAddress: null,
    dex: null,
    pair: null,
  };
}

class TestProviderStub {
  public blockHandler: ((blockNumber: number) => Promise<void>) | null = null;
  public latestBlockNumber: number = 200;
  private readonly blocks: Map<number, IBlockEnvelope> = new Map<number, IBlockEnvelope>();

  public setBlock(blockNumber: number, block: IBlockEnvelope): void {
    this.blocks.set(blockNumber, block);
  }

  public async subscribeBlocks(
    handler: (blockNumber: number) => Promise<void>,
  ): Promise<ISubscriptionHandle> {
    this.blockHandler = handler;
    return { stop: async (): Promise<void> => undefined };
  }

  public async getBlockEnvelope(blockNumber: number): Promise<IBlockEnvelope | null> {
    return this.blocks.get(blockNumber) ?? null;
  }

  public async getLatestBlockNumber(): Promise<number> {
    return this.latestBlockNumber;
  }

  public async getReceiptEnvelope(_txHash: string): Promise<IReceiptEnvelope | null> {
    return { txHash: _txHash, logs: [] };
  }
}

class TestChainStreamService extends BaseChainStreamService {
  private readonly stub: TestProviderStub;
  private readonly _trackedAddresses: readonly string[];
  private readonly _classifyResult: ClassifiedEvent | null;
  private readonly _watcherEnabled: boolean;
  private readonly _queueMax: number;
  private readonly _catchupBatch: number;
  private readonly _reorgConfirmations: number;
  public readonly snapshots: IChainRuntimeSnapshot[] = [];

  public constructor(
    providerFailoverService: ProviderFailoverService,
    chainCheckpointsRepository: ChainCheckpointsRepository,
    subscriptionsRepository: SubscriptionsRepository,
    processedEventsRepository: ProcessedEventsRepository,
    walletEventsRepository: WalletEventsRepository,
    alertDispatcherService: AlertDispatcherService,
    options: {
      stub: TestProviderStub;
      trackedAddresses: readonly string[];
      classifyResult: ClassifiedEvent | null;
      watcherEnabled?: boolean;
      queueMax?: number;
      catchupBatch?: number;
      reorgConfirmations?: number;
    },
  ) {
    const dependencies: IBaseChainStreamDependencies = {
      providerFailoverService,
      chainCheckpointsRepository,
      subscriptionsRepository,
      processedEventsRepository,
      walletEventsRepository,
      alertDispatcherService,
    };
    super(dependencies);
    this.stub = options.stub;
    this._trackedAddresses = options.trackedAddresses;
    this._classifyResult = options.classifyResult;
    this._watcherEnabled = options.watcherEnabled ?? true;
    this._queueMax = options.queueMax ?? 20;
    this._catchupBatch = options.catchupBatch ?? 20;
    this._reorgConfirmations = options.reorgConfirmations ?? 0;
  }

  protected getConfig(): IChainStreamConfig {
    return CHAIN_CONFIG;
  }

  protected isWatcherEnabled(): boolean {
    return this._watcherEnabled;
  }

  protected getQueueMax(): number {
    return this._queueMax;
  }

  protected getCatchupBatch(): number {
    return this._catchupBatch;
  }

  protected getHeartbeatIntervalSec(): number {
    return 3600;
  }

  protected getReorgConfirmations(): number {
    return this._reorgConfirmations;
  }

  protected async fetchBlockEnvelope(blockNumber: number): Promise<IBlockEnvelope | null> {
    return this.stub.getBlockEnvelope(blockNumber);
  }

  protected async fetchLatestBlockNumber(): Promise<number> {
    return this.stub.getLatestBlockNumber();
  }

  protected async subscribeToBlocks(
    handler: (blockNumber: number) => Promise<void>,
  ): Promise<ISubscriptionHandle> {
    return this.stub.subscribeBlocks(handler);
  }

  protected async resolveTrackedAddresses(): Promise<readonly string[]> {
    return this._trackedAddresses;
  }

  protected matchTransaction(
    txFrom: string,
    txTo: string | null,
    trackedAddresses: readonly string[],
  ): string | null {
    for (const address of trackedAddresses) {
      if (txFrom === address || txTo === address) {
        return address;
      }
    }
    return null;
  }

  protected async classifyTransaction(
    _matched: IMatchedTransaction,
  ): Promise<ClassifiedEvent | null> {
    return this._classifyResult;
  }

  protected override onSnapshotUpdated(snapshot: IChainRuntimeSnapshot): void {
    this.snapshots.push(snapshot);
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, ms);
  });
};

function createMocks(): {
  providerStub: TestProviderStub;
  providerFailoverService: ProviderFailoverService;
  chainCheckpointsRepository: ChainCheckpointsRepository;
  processedEventsRepository: ProcessedEventsRepository;
  walletEventsRepository: WalletEventsRepository;
  subscriptionsRepository: SubscriptionsRepository;
  alertDispatcherService: AlertDispatcherService;
  dispatchedEvents: ClassifiedEvent[];
  saveEventMock: ReturnType<typeof vi.fn>;
} {
  const providerStub = new TestProviderStub();
  const providerFailoverService = {
    execute: async <T>(operation: ProviderOperation<T>): Promise<T> =>
      operation(providerStub as never),
    executeForChain: async <T>(_chainKey: ChainKey, operation: ProviderOperation<T>): Promise<T> =>
      operation(providerStub as never),
    getCurrentBackoffMs: (): number => 0,
  } as unknown as ProviderFailoverService;

  const chainCheckpointsRepository = {
    getLastProcessedBlock: async (): Promise<number | null> => null,
    saveLastProcessedBlock: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChainCheckpointsRepository;

  const processedEventsRepository = {
    hasProcessed: async (): Promise<boolean> => false,
    markProcessed: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProcessedEventsRepository;

  const saveEventMock = vi.fn().mockResolvedValue(undefined);
  const walletEventsRepository = {
    saveEvent: saveEventMock,
  } as unknown as WalletEventsRepository;

  const subscriptionsRepository = {
    listTrackedAddresses: async (): Promise<readonly string[]> => [TRACKED_ADDRESS],
  } as unknown as SubscriptionsRepository;

  const dispatchedEvents: ClassifiedEvent[] = [];
  const alertDispatcherService = {
    dispatch: async (event: ClassifiedEvent): Promise<void> => {
      dispatchedEvents.push(event);
    },
  } as unknown as AlertDispatcherService;

  return {
    providerStub,
    providerFailoverService,
    chainCheckpointsRepository,
    processedEventsRepository,
    walletEventsRepository,
    subscriptionsRepository,
    alertDispatcherService,
    dispatchedEvents,
    saveEventMock,
  };
}

describe('BaseChainStreamService', (): void => {
  it('processes matched transaction through orchestration pipeline', async (): Promise<void> => {
    const mocks = createMocks();
    mocks.providerStub.setBlock(42, {
      number: 42,
      timestampSec: 1_739_400_000,
      transactions: [
        {
          hash: '0xabc',
          from: TRACKED_ADDRESS,
          to: '0xbbbb',
          blockTimestampSec: 1_739_400_000,
        },
      ],
    });

    const service = new TestChainStreamService(
      mocks.providerFailoverService,
      mocks.chainCheckpointsRepository,
      mocks.subscriptionsRepository,
      mocks.processedEventsRepository,
      mocks.walletEventsRepository,
      mocks.alertDispatcherService,
      {
        stub: mocks.providerStub,
        trackedAddresses: [TRACKED_ADDRESS],
        classifyResult: makeClassifiedEvent('0xabc'),
      },
    );

    await service.onModuleInit();

    if (mocks.providerStub.blockHandler === null) {
      throw new Error('Block handler not registered');
    }

    await mocks.providerStub.blockHandler(42);
    await sleep(30);

    expect(mocks.saveEventMock).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchedEvents).toHaveLength(1);
    expect(mocks.dispatchedEvents[0]?.txHash).toBe('0xabc');

    await service.onModuleDestroy();
  });

  it('recovers blocks from checkpoint on startup', async (): Promise<void> => {
    const mocks = createMocks();
    mocks.providerStub.latestBlockNumber = 105;

    (
      mocks.chainCheckpointsRepository as unknown as {
        getLastProcessedBlock: () => Promise<number | null>;
      }
    ).getLastProcessedBlock = async (): Promise<number | null> => 100;

    for (let b: number = 101; b <= 105; b += 1) {
      mocks.providerStub.setBlock(b, {
        number: b,
        timestampSec: 1_739_400_000,
        transactions: [
          {
            hash: `tx-${String(b)}`,
            from: TRACKED_ADDRESS,
            to: '0xbbbb',
            blockTimestampSec: 1_739_400_000,
          },
        ],
      });
    }

    const service = new TestChainStreamService(
      mocks.providerFailoverService,
      mocks.chainCheckpointsRepository,
      mocks.subscriptionsRepository,
      mocks.processedEventsRepository,
      mocks.walletEventsRepository,
      mocks.alertDispatcherService,
      {
        stub: mocks.providerStub,
        trackedAddresses: [TRACKED_ADDRESS],
        classifyResult: makeClassifiedEvent('any'),
      },
    );

    await service.onModuleInit();
    await sleep(80);

    expect(mocks.saveEventMock).toHaveBeenCalledTimes(5);
    expect(mocks.dispatchedEvents).toHaveLength(5);

    await service.onModuleDestroy();
  });

  it('skips already processed transactions', async (): Promise<void> => {
    const mocks = createMocks();
    (
      mocks.processedEventsRepository as unknown as { hasProcessed: () => Promise<boolean> }
    ).hasProcessed = async (): Promise<boolean> => true;

    mocks.providerStub.setBlock(10, {
      number: 10,
      timestampSec: 1_739_400_000,
      transactions: [
        {
          hash: '0xdup',
          from: TRACKED_ADDRESS,
          to: '0xbbbb',
          blockTimestampSec: 1_739_400_000,
        },
      ],
    });

    const service = new TestChainStreamService(
      mocks.providerFailoverService,
      mocks.chainCheckpointsRepository,
      mocks.subscriptionsRepository,
      mocks.processedEventsRepository,
      mocks.walletEventsRepository,
      mocks.alertDispatcherService,
      {
        stub: mocks.providerStub,
        trackedAddresses: [TRACKED_ADDRESS],
        classifyResult: makeClassifiedEvent('0xdup'),
      },
    );

    await service.onModuleInit();

    if (mocks.providerStub.blockHandler === null) {
      throw new Error('Block handler not registered');
    }

    await mocks.providerStub.blockHandler(10);
    await sleep(30);

    expect(mocks.saveEventMock).not.toHaveBeenCalled();
    expect(mocks.dispatchedEvents).toHaveLength(0);

    await service.onModuleDestroy();
  });

  it('publishes runtime snapshots on enqueue and heartbeat', async (): Promise<void> => {
    const mocks = createMocks();
    mocks.providerStub.setBlock(1, {
      number: 1,
      timestampSec: 1_739_400_000,
      transactions: [],
    });

    const service = new TestChainStreamService(
      mocks.providerFailoverService,
      mocks.chainCheckpointsRepository,
      mocks.subscriptionsRepository,
      mocks.processedEventsRepository,
      mocks.walletEventsRepository,
      mocks.alertDispatcherService,
      {
        stub: mocks.providerStub,
        trackedAddresses: [],
        classifyResult: null,
      },
    );

    await service.onModuleInit();

    if (mocks.providerStub.blockHandler === null) {
      throw new Error('Block handler not registered');
    }

    await mocks.providerStub.blockHandler(1);
    await sleep(10);

    expect(service.snapshots.length).toBeGreaterThan(0);
    const lastSnapshot: IChainRuntimeSnapshot | undefined =
      service.snapshots[service.snapshots.length - 1];
    expect(lastSnapshot?.chainKey).toBe(CHAIN_KEY);

    await service.onModuleDestroy();
  });
});
