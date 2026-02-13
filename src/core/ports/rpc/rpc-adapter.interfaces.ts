import type { IBlockEnvelope, IReceiptEnvelope } from './block-stream.interfaces';
import type { ChainKey } from '../../chains/chain-key.interfaces';

export interface IProviderHealth {
  readonly provider: string;
  readonly ok: boolean;
  readonly details: string;
}

export type BlockHandler = (blockNumber: number) => Promise<void>;

export interface ISubscriptionHandle {
  stop(): Promise<void>;
}

export interface IRpcAdapter {
  getName(): string;
  subscribeBlocks(handler: BlockHandler): Promise<ISubscriptionHandle>;
  getLatestBlockNumber(): Promise<number>;
  getBlockEnvelope(blockNumber: number): Promise<IBlockEnvelope | null>;
  getReceiptEnvelope(txHash: string): Promise<IReceiptEnvelope | null>;
  healthCheck(): Promise<IProviderHealth>;
  disconnect(): Promise<void>;
}

export interface IPrimaryRpcAdapter extends IRpcAdapter {}

export interface IFallbackRpcAdapter extends IRpcAdapter {}

export interface IProviderFactory {
  createPrimary(chainKey: ChainKey): IPrimaryRpcAdapter;
  createFallback(chainKey: ChainKey): IFallbackRpcAdapter;
}

export type ProviderOperation<T> = (provider: IRpcAdapter) => Promise<T>;

export interface IProviderFailoverService {
  execute<T>(operation: ProviderOperation<T>): Promise<T>;
  executeForChain<T>(chainKey: ChainKey, operation: ProviderOperation<T>): Promise<T>;
}
