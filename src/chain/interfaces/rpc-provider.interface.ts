import type { Block, TransactionReceipt, TransactionResponse } from 'ethers';

import type { ChainId } from '../chain.types';

export type ProviderHealth = {
  readonly provider: string;
  readonly ok: boolean;
  readonly details: string;
};

export type BlockHandler = (blockNumber: number) => Promise<void>;

export interface ISubscriptionHandle {
  stop(): Promise<void>;
}

export interface IRpcProvider {
  getName(): string;
  subscribeBlocks(handler: BlockHandler): Promise<ISubscriptionHandle>;
  getBlock(blockNumber: number): Promise<Block | null>;
  getTransaction(txHash: string): Promise<TransactionResponse | null>;
  getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null>;
  healthCheck(): Promise<ProviderHealth>;
  disconnect(): Promise<void>;
}

export interface IPrimaryRpcProvider extends IRpcProvider {}

export interface IFallbackRpcProvider extends IRpcProvider {}

export interface IProviderFactory {
  createPrimary(chainId: ChainId): IPrimaryRpcProvider;
  createFallback(chainId: ChainId): IFallbackRpcProvider;
}

export type ProviderOperation<T> = (provider: IRpcProvider) => Promise<T>;

export interface IProviderFailoverService {
  execute<T>(operation: ProviderOperation<T>): Promise<T>;
}
