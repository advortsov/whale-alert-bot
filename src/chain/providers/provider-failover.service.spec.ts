import { ProviderFailoverService } from './provider-failover.service';
import { ProviderFactory } from './provider.factory';
import { RpcThrottlerService } from './rpc-throttler.service';
import type { AppConfigService } from '../../config/app-config.service';
import type {
  BlockWithTransactions,
  IFallbackRpcProvider,
  IPrimaryRpcProvider,
  ISubscriptionHandle,
  ProviderHealth,
} from '../interfaces/rpc-provider.interface';

class RpcConfigStub {
  public readonly chainRpcMinIntervalMs: number = 0;
  public readonly chainBackoffBaseMs: number = 1;
  public readonly chainBackoffMaxMs: number = 10;
}

class PrimaryProviderStub implements IPrimaryRpcProvider {
  public getName(): string {
    return 'primary';
  }

  public async subscribeBlocks(): Promise<ISubscriptionHandle> {
    return {
      stop: async (): Promise<void> => {
        return;
      },
    };
  }

  public async getBlock(): Promise<null> {
    return null;
  }

  public async getBlockWithTransactions(): Promise<BlockWithTransactions | null> {
    return null;
  }

  public async getTransaction(): Promise<null> {
    return null;
  }

  public async getTransactionReceipt(): Promise<null> {
    return null;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return { provider: 'primary', ok: true, details: 'ok' };
  }

  public async disconnect(): Promise<void> {
    return;
  }
}

class FallbackProviderStub implements IFallbackRpcProvider {
  public getName(): string {
    return 'fallback';
  }

  public async subscribeBlocks(): Promise<ISubscriptionHandle> {
    return {
      stop: async (): Promise<void> => {
        return;
      },
    };
  }

  public async getBlock(): Promise<null> {
    return null;
  }

  public async getBlockWithTransactions(): Promise<BlockWithTransactions | null> {
    return null;
  }

  public async getTransaction(): Promise<null> {
    return null;
  }

  public async getTransactionReceipt(): Promise<null> {
    return null;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return { provider: 'fallback', ok: true, details: 'ok' };
  }

  public async disconnect(): Promise<void> {
    return;
  }
}

describe('ProviderFailoverService', (): void => {
  it('uses fallback when primary operation throws', async (): Promise<void> => {
    const primary: IPrimaryRpcProvider = new PrimaryProviderStub();
    const fallback: IFallbackRpcProvider = new FallbackProviderStub();

    const factory: ProviderFactory = new ProviderFactory(primary, fallback);
    const throttler: RpcThrottlerService = new RpcThrottlerService(
      new RpcConfigStub() as unknown as AppConfigService,
    );
    const service: ProviderFailoverService = new ProviderFailoverService(factory, throttler);

    const result: string = await service.execute(async (provider): Promise<string> => {
      if (provider.getName() === 'primary') {
        throw new Error('primary failed');
      }

      return provider.getName();
    });

    expect(result).toBe('fallback');
  });
});
