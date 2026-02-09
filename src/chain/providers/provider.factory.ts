import { Inject, Injectable } from '@nestjs/common';

import { ChainId } from '../chain.types';
import { FALLBACK_RPC_PROVIDER, PRIMARY_RPC_PROVIDER } from '../constants/chain.tokens';
import type {
  IFallbackRpcProvider,
  IPrimaryRpcProvider,
  IProviderFactory,
} from '../interfaces/rpc-provider.interface';

@Injectable()
export class ProviderFactory implements IProviderFactory {
  public constructor(
    @Inject(PRIMARY_RPC_PROVIDER) private readonly primaryProvider: IPrimaryRpcProvider,
    @Inject(FALLBACK_RPC_PROVIDER) private readonly fallbackProvider: IFallbackRpcProvider,
  ) {}

  public createPrimary(_chainId: ChainId): IPrimaryRpcProvider {
    return this.primaryProvider;
  }

  public createFallback(_chainId: ChainId): IFallbackRpcProvider {
    return this.fallbackProvider;
  }
}
