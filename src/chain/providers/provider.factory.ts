import { Inject, Injectable } from '@nestjs/common';

import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type {
  IFallbackRpcAdapter,
  IPrimaryRpcAdapter,
  IProviderFactory,
} from '../../core/ports/rpc/rpc-adapter.interfaces';
import {
  ETHEREUM_FALLBACK_RPC_ADAPTER,
  ETHEREUM_PRIMARY_RPC_ADAPTER,
  SOLANA_FALLBACK_RPC_ADAPTER,
  SOLANA_PRIMARY_RPC_ADAPTER,
} from '../../core/ports/rpc/rpc-port.tokens';

@Injectable()
export class ProviderFactory implements IProviderFactory {
  public constructor(
    @Inject(ETHEREUM_PRIMARY_RPC_ADAPTER)
    private readonly ethereumPrimaryProvider: IPrimaryRpcAdapter,
    @Inject(ETHEREUM_FALLBACK_RPC_ADAPTER)
    private readonly ethereumFallbackProvider: IFallbackRpcAdapter,
    @Inject(SOLANA_PRIMARY_RPC_ADAPTER)
    private readonly solanaPrimaryProvider: IPrimaryRpcAdapter,
    @Inject(SOLANA_FALLBACK_RPC_ADAPTER)
    private readonly solanaFallbackProvider: IFallbackRpcAdapter,
  ) {}

  public createPrimary(chainId: ChainKey): IPrimaryRpcAdapter {
    if (chainId === ChainKey.ETHEREUM_MAINNET) {
      return this.ethereumPrimaryProvider;
    }

    if (chainId === ChainKey.SOLANA_MAINNET) {
      return this.solanaPrimaryProvider;
    }

    throw new Error(`Primary RPC adapter is not configured for chainKey=${chainId}`);
  }

  public createFallback(chainId: ChainKey): IFallbackRpcAdapter {
    if (chainId === ChainKey.ETHEREUM_MAINNET) {
      return this.ethereumFallbackProvider;
    }

    if (chainId === ChainKey.SOLANA_MAINNET) {
      return this.solanaFallbackProvider;
    }

    throw new Error(`Fallback RPC adapter is not configured for chainKey=${chainId}`);
  }
}
