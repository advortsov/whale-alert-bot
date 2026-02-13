export type {
  BlockHandler,
  IFallbackRpcAdapter as IFallbackRpcProvider,
  IPrimaryRpcAdapter as IPrimaryRpcProvider,
  IProviderFactory,
  IProviderFailoverService,
  IRpcAdapter as IRpcProvider,
  ISubscriptionHandle,
  IProviderHealth,
  ProviderOperation,
} from '../../core/ports/rpc/rpc-adapter.interfaces';

export type { IBlockEnvelope as BlockWithTransactions } from '../../core/ports/rpc/block-stream.interfaces';
