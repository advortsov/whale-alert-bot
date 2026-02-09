export type {
  BlockHandler,
  IFallbackRpcAdapter as IFallbackRpcProvider,
  IPrimaryRpcAdapter as IPrimaryRpcProvider,
  IProviderFactory,
  IProviderFailoverService,
  IRpcAdapter as IRpcProvider,
  ISubscriptionHandle,
  ProviderHealth,
  ProviderOperation,
} from '../../core/ports/rpc/rpc-adapter.interfaces';

export type { BlockEnvelope as BlockWithTransactions } from '../../core/ports/rpc/block-stream.interfaces';
