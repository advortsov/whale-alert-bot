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
  public readonly chainSolanaBackoffBaseMs: number = 1;
  public readonly chainBackoffMaxMs: number = 10;
}

class RpcConfigSlowBackoffStub {
  public readonly chainRpcMinIntervalMs: number = 0;
  public readonly chainBackoffBaseMs: number = 1000;
  public readonly chainSolanaBackoffBaseMs: number = 5000;
  public readonly chainBackoffMaxMs: number = 60_000;
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

  it('keeps and increases backoff when primary is rate-limited but fallback succeeds', async (): Promise<void> => {
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

    const operation = async (
      provider: IPrimaryRpcAdapter | IFallbackRpcAdapter,
    ): Promise<string> => {
      if (provider.getName() === 'primary') {
        throw new Error('429 primary rate limit');
      }

      return provider.getName();
    };

    const firstResult: string = await service.execute(operation);
    const firstBackoffMs: number = service.getCurrentBackoffMs();
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, 5);
    });
    const secondResult: string = await service.execute(operation);
    const secondBackoffMs: number = service.getCurrentBackoffMs();

    expect(firstResult).toBe('fallback');
    expect(secondResult).toBe('fallback');
    expect(firstBackoffMs).toBe(1);
    expect(secondBackoffMs).toBe(2);
  });

  it('uses fallback directly while primary cooldown is active', async (): Promise<void> => {
    const primary: IPrimaryRpcAdapter = new PrimaryProviderStub();
    const fallback: IFallbackRpcAdapter = new FallbackProviderStub();
    let primaryCalls: number = 0;

    const factory: ProviderFactory = {
      createPrimary: (): IPrimaryRpcAdapter => primary,
      createFallback: (): IFallbackRpcAdapter => fallback,
    } as unknown as ProviderFactory;
    const throttler: RpcThrottlerService = new RpcThrottlerService(
      new RpcConfigSlowBackoffStub() as unknown as AppConfigService,
    );
    const service: ProviderFailoverService = new ProviderFailoverService(factory, throttler);

    const operation = async (
      provider: IPrimaryRpcAdapter | IFallbackRpcAdapter,
    ): Promise<string> => {
      if (provider.getName() === 'primary') {
        primaryCalls += 1;
        throw new Error('429 primary rate limit');
      }

      return provider.getName();
    };

    const firstResult: string = await service.executeForChain(ChainKey.SOLANA_MAINNET, operation);
    const secondResult: string = await service.executeForChain(ChainKey.SOLANA_MAINNET, operation);

    expect(firstResult).toBe('fallback');
    expect(secondResult).toBe('fallback');
    expect(primaryCalls).toBe(1);
  });

  it('resets ethereum primary backoff only after three consecutive successful primary calls', async (): Promise<void> => {
    const primary: IPrimaryRpcAdapter = new PrimaryProviderStub();
    const fallback: IFallbackRpcAdapter = new FallbackProviderStub();
    let primaryCalls: number = 0;

    const factory: ProviderFactory = {
      createPrimary: (): IPrimaryRpcAdapter => primary,
      createFallback: (): IFallbackRpcAdapter => fallback,
    } as unknown as ProviderFactory;
    const throttler: RpcThrottlerService = new RpcThrottlerService(
      new RpcConfigStub() as unknown as AppConfigService,
    );
    const service: ProviderFailoverService = new ProviderFailoverService(factory, throttler);

    const operation = async (
      provider: IPrimaryRpcAdapter | IFallbackRpcAdapter,
    ): Promise<string> => {
      if (provider.getName() === 'primary') {
        primaryCalls += 1;

        if (primaryCalls === 1) {
          throw new Error('429 primary rate limit');
        }
      }

      return provider.getName();
    };

    await service.executeForChain(ChainKey.ETHEREUM_MAINNET, operation);
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, 2);
    });

    await service.executeForChain(ChainKey.ETHEREUM_MAINNET, operation);
    expect(service.getCurrentBackoffMs(ChainKey.ETHEREUM_MAINNET)).toBe(1);

    await service.executeForChain(ChainKey.ETHEREUM_MAINNET, operation);
    expect(service.getCurrentBackoffMs(ChainKey.ETHEREUM_MAINNET)).toBe(1);

    await service.executeForChain(ChainKey.ETHEREUM_MAINNET, operation);
    expect(service.getCurrentBackoffMs(ChainKey.ETHEREUM_MAINNET)).toBe(0);
  });

  it('does not auto-reset solana primary backoff after successful calls', async (): Promise<void> => {
    const primary: IPrimaryRpcAdapter = new PrimaryProviderStub();
    const fallback: IFallbackRpcAdapter = new FallbackProviderStub();
    let primaryCalls: number = 0;

    const factory: ProviderFactory = {
      createPrimary: (): IPrimaryRpcAdapter => primary,
      createFallback: (): IFallbackRpcAdapter => fallback,
    } as unknown as ProviderFactory;
    const throttler: RpcThrottlerService = new RpcThrottlerService(
      new RpcConfigStub() as unknown as AppConfigService,
    );
    const service: ProviderFailoverService = new ProviderFailoverService(factory, throttler);

    const operation = async (
      provider: IPrimaryRpcAdapter | IFallbackRpcAdapter,
    ): Promise<string> => {
      if (provider.getName() === 'primary') {
        primaryCalls += 1;

        if (primaryCalls === 1) {
          throw new Error('429 primary rate limit');
        }
      }

      return provider.getName();
    };

    await service.executeForChain(ChainKey.SOLANA_MAINNET, operation);
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, 2);
    });

    await service.executeForChain(ChainKey.SOLANA_MAINNET, operation);
    await service.executeForChain(ChainKey.SOLANA_MAINNET, operation);
    await service.executeForChain(ChainKey.SOLANA_MAINNET, operation);

    expect(service.getCurrentBackoffMs(ChainKey.SOLANA_MAINNET)).toBe(1);
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

  it('routes executeForChain to tron provider', async (): Promise<void> => {
    const ethereumPrimary: IPrimaryRpcAdapter = new PrimaryProviderStub();
    const tronPrimary: IPrimaryRpcAdapter = new (class TronPrimaryProviderStub
      extends PrimaryProviderStub
      implements IPrimaryRpcAdapter
    {
      public override getName(): string {
        return 'tron-primary';
      }
    })();
    const fallback: IFallbackRpcAdapter = new FallbackProviderStub();

    const createPrimaryMock = vi.fn(
      (chainKey: ChainKey): IPrimaryRpcAdapter =>
        chainKey === ChainKey.TRON_MAINNET ? tronPrimary : ethereumPrimary,
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
      ChainKey.TRON_MAINNET,
      async (provider): Promise<string> => provider.getName(),
    );

    expect(result).toBe('tron-primary');
    expect(createPrimaryMock).toHaveBeenCalledWith(ChainKey.TRON_MAINNET);
  });
});
