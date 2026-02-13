import type { ChainKey } from './chain-key.interfaces';

export interface IChainCapabilities {
  readonly chainKey: ChainKey;
  readonly supportsNativeTransfers: boolean;
  readonly supportsTokenTransfers: boolean;
  readonly supportsDexSwaps: boolean;
  readonly supportsExplorerHistory: boolean;
  readonly supportsLiveBlockStream: boolean;
}
