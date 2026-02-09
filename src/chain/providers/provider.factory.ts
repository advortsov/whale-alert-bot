import { Inject, Injectable } from '@nestjs/common';

import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type {
  IFallbackRpcAdapter,
  IPrimaryRpcAdapter,
  IProviderFactory,
} from '../../core/ports/rpc/rpc-adapter.interfaces';
import {
  FALLBACK_RPC_ADAPTER as FALLBACK_RPC_PROVIDER,
  PRIMARY_RPC_ADAPTER as PRIMARY_RPC_PROVIDER,
} from '../../core/ports/rpc/rpc-port.tokens';

@Injectable()
export class ProviderFactory implements IProviderFactory {
  public constructor(
    @Inject(PRIMARY_RPC_PROVIDER) private readonly primaryProvider: IPrimaryRpcAdapter,
    @Inject(FALLBACK_RPC_PROVIDER) private readonly fallbackProvider: IFallbackRpcAdapter,
  ) {}

  public createPrimary(_chainId: ChainKey): IPrimaryRpcAdapter {
    return this.primaryProvider;
  }

  public createFallback(_chainId: ChainKey): IFallbackRpcAdapter {
    return this.fallbackProvider;
  }
}
