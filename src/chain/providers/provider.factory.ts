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
  TRON_FALLBACK_RPC_ADAPTER,
  TRON_PRIMARY_RPC_ADAPTER,
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
    @Inject(TRON_PRIMARY_RPC_ADAPTER)
    private readonly tronPrimaryProvider: IPrimaryRpcAdapter,
    @Inject(TRON_FALLBACK_RPC_ADAPTER)
    private readonly tronFallbackProvider: IFallbackRpcAdapter,
  ) {}

  public createPrimary(chainId: ChainKey): IPrimaryRpcAdapter {
    switch (chainId) {
      case ChainKey.ETHEREUM_MAINNET:
        return this.ethereumPrimaryProvider;
      case ChainKey.SOLANA_MAINNET:
        return this.solanaPrimaryProvider;
      case ChainKey.TRON_MAINNET:
        return this.tronPrimaryProvider;
    }

    throw new Error('Primary RPC adapter is not configured for provided chain key');
  }

  public createFallback(chainId: ChainKey): IFallbackRpcAdapter {
    switch (chainId) {
      case ChainKey.ETHEREUM_MAINNET:
        return this.ethereumFallbackProvider;
      case ChainKey.SOLANA_MAINNET:
        return this.solanaFallbackProvider;
      case ChainKey.TRON_MAINNET:
        return this.tronFallbackProvider;
    }

    throw new Error('Fallback RPC adapter is not configured for provided chain key');
  }
}
