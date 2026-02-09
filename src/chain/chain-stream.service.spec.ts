import type { TransactionReceipt, TransactionResponse } from 'ethers';
import { describe, expect, it } from 'vitest';

import { ChainStreamService } from './chain-stream.service';
import {
  ChainId,
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
  type ObservedTransaction,
} from './chain.types';
import type { EventClassifierService } from './event-classifier.service';
import type {
  BlockWithTransactions,
  ISubscriptionHandle,
  ProviderOperation,
} from './interfaces/rpc-provider.interface';
import type { ProviderHealth } from './interfaces/rpc-provider.interface';
import type { ProviderFailoverService } from './providers/provider-failover.service';
import type { ProviderFactory } from './providers/provider.factory';
import type { AlertDispatcherService } from '../alerts/alert-dispatcher.service';
import type { AppConfigService } from '../config/app-config.service';
import type { ProcessedEventsRepository } from '../storage/repositories/processed-events.repository';
import type { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';

class ProviderStub {
  public blockHandler: ((blockNumber: number) => Promise<void>) | null = null;
  public getTransactionCalls: number = 0;
  public receiptCalls: string[] = [];
  private readonly blocks: Map<number, BlockWithTransactions> = new Map<
    number,
    BlockWithTransactions
  >();

  public setBlock(blockNumber: number, block: BlockWithTransactions): void {
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

  public async getBlockWithTransactions(
    blockNumber: number,
  ): Promise<BlockWithTransactions | null> {
    return this.blocks.get(blockNumber) ?? null;
  }

  public async getBlock(): Promise<null> {
    return null;
  }

  public async getTransaction(): Promise<null> {
    this.getTransactionCalls += 1;
    return null;
  }

  public async getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
    this.receiptCalls.push(txHash);

    return {
      logs: [],
    } as unknown as TransactionReceipt;
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
    const txMatchedByFrom: TransactionResponse = {
      hash: '0x1',
      from: trackedAddress,
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    } as TransactionResponse;
    const txMatchedByTo: TransactionResponse = {
      hash: '0x2',
      from: '0xcccccccccccccccccccccccccccccccccccccccc',
      to: trackedAddress,
    } as TransactionResponse;
    const txUnmatched: TransactionResponse = {
      hash: '0x3',
      from: '0xdddddddddddddddddddddddddddddddddddddddd',
      to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    } as TransactionResponse;

    providerStub.setBlock(123, {
      prefetchedTransactions: [txMatchedByFrom, txMatchedByTo, txUnmatched],
    } as BlockWithTransactions);

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
    } as unknown as AppConfigService;

    const service: ChainStreamService = new ChainStreamService(
      appConfigService,
      providerFactory,
      providerFailoverService,
      subscriptionsRepository,
      processedEventsRepository,
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

    expect(providerStub.getTransactionCalls).toBe(0);
    expect(providerStub.receiptCalls).toEqual(['0x1', '0x2']);
    expect(dispatched).toHaveLength(2);

    await service.onModuleDestroy();
  });
});
