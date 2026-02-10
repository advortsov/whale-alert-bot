import { vi } from 'vitest';

import { ProviderFailoverService } from './provider-failover.service';
import type { ProviderFactory } from './provider.factory';
import { RpcThrottlerService } from './rpc-throttler.service';
import type { AppConfigService } from '../../config/app-config.service';
import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type { BlockEnvelope, ReceiptEnvelope } from '../../core/ports/rpc/block-stream.interfaces';
import type {
  IFallbackRpcAdapter,
  IPrimaryRpcAdapter,
  ISubscriptionHandle,
  ProviderHealth,
} from '../../core/ports/rpc/rpc-adapter.interfaces';

class RpcConfigStub {
  public readonly chainRpcMinIntervalMs: number = 0;
  public readonly chainBackoffBaseMs: number = 1;
  public readonly chainBackoffMaxMs: number = 10;
}

class PrimaryProviderStub implements IPrimaryRpcAdapter {
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

  public async getBlockEnvelope(): Promise<BlockEnvelope | null> {
    return null;
  }

  public async getLatestBlockNumber(): Promise<number> {
    return 1;
  }

  public async getReceiptEnvelope(): Promise<ReceiptEnvelope | null> {
    return null;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return { provider: 'primary', ok: true, details: 'ok' };
  }

  public async disconnect(): Promise<void> {
    return;
  }
}

class FallbackProviderStub implements IFallbackRpcAdapter {
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

  public async getBlockEnvelope(): Promise<BlockEnvelope | null> {
    return null;
  }

  public async getLatestBlockNumber(): Promise<number> {
    return 1;
  }

  public async getReceiptEnvelope(): Promise<ReceiptEnvelope | null> {
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
    const primary: IPrimaryRpcAdapter = new PrimaryProviderStub();
    const fallback: IFallbackRpcAdapter = new FallbackProviderStub();

    const factory: ProviderFactory = {
      createPrimary: (): IPrimaryRpcAdapter => primary,
      createFallback: (): IFallbackRpcAdapter => fallback,
    } as unknown as ProviderFactory;
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

  it('routes executeForChain call with selected chain key', async (): Promise<void> => {
    const ethereumPrimary: IPrimaryRpcAdapter = new PrimaryProviderStub();
    const solanaPrimary: IPrimaryRpcAdapter = new (class SolanaPrimaryProviderStub
      extends PrimaryProviderStub
      implements IPrimaryRpcAdapter
    {
      public override getName(): string {
        return 'sol-primary';
      }
    })();
    const fallback: IFallbackRpcAdapter = new FallbackProviderStub();

    const createPrimaryMock = vi.fn(
      (chainKey: ChainKey): IPrimaryRpcAdapter =>
        chainKey === ChainKey.SOLANA_MAINNET ? solanaPrimary : ethereumPrimary,
    );
    const factory: ProviderFactory = {
      createPrimary: createPrimaryMock,
      createFallback: (): IFallbackRpcAdapter => fallback,
    } as unknown as ProviderFactory;
    const throttler: RpcThrottlerService = new RpcThrottlerService(
      new RpcConfigStub() as unknown as AppConfigService,
    );
    const service: ProviderFailoverService = new ProviderFailoverService(factory, throttler);

    const result: string = await service.executeForChain(
      ChainKey.SOLANA_MAINNET,
      async (provider): Promise<string> => provider.getName(),
    );

    expect(result).toBe('sol-primary');
    expect(createPrimaryMock).toHaveBeenCalledWith(ChainKey.SOLANA_MAINNET);
  });
});
