import { ProviderFactory } from './provider.factory';
import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type { BlockEnvelope, ReceiptEnvelope } from '../../core/ports/rpc/block-stream.interfaces';
import type {
  IFallbackRpcAdapter,
  IPrimaryRpcAdapter,
  ISubscriptionHandle,
  ProviderHealth,
} from '../../core/ports/rpc/rpc-adapter.interfaces';

class PrimaryAdapterStub implements IPrimaryRpcAdapter {
  public constructor(private readonly name: string) {}

  public getName(): string {
    return this.name;
  }

  public async subscribeBlocks(): Promise<ISubscriptionHandle> {
    return {
      stop: async (): Promise<void> => undefined,
    };
  }

  public async getLatestBlockNumber(): Promise<number> {
    return 1;
  }

  public async getBlockEnvelope(): Promise<BlockEnvelope | null> {
    return null;
  }

  public async getReceiptEnvelope(): Promise<ReceiptEnvelope | null> {
    return null;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      ok: true,
      details: 'ok',
    };
  }

  public async disconnect(): Promise<void> {
    return;
  }
}

class FallbackAdapterStub implements IFallbackRpcAdapter {
  public constructor(private readonly name: string) {}

  public getName(): string {
    return this.name;
  }

  public async subscribeBlocks(): Promise<ISubscriptionHandle> {
    return {
      stop: async (): Promise<void> => undefined,
    };
  }

  public async getLatestBlockNumber(): Promise<number> {
    return 1;
  }

  public async getBlockEnvelope(): Promise<BlockEnvelope | null> {
    return null;
  }

  public async getReceiptEnvelope(): Promise<ReceiptEnvelope | null> {
    return null;
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      ok: true,
      details: 'ok',
    };
  }

  public async disconnect(): Promise<void> {
    return;
  }
}

describe('ProviderFactory', (): void => {
  it('returns ethereum providers for ethereum chain key', (): void => {
    const ethereumPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('eth-primary');
    const ethereumFallback: IFallbackRpcAdapter = new FallbackAdapterStub('eth-fallback');
    const solanaPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('sol-primary');
    const solanaFallback: IFallbackRpcAdapter = new FallbackAdapterStub('sol-fallback');
    const tronPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('tron-primary');
    const tronFallback: IFallbackRpcAdapter = new FallbackAdapterStub('tron-fallback');

    const factory: ProviderFactory = new ProviderFactory(
      ethereumPrimary,
      ethereumFallback,
      solanaPrimary,
      solanaFallback,
      tronPrimary,
      tronFallback,
    );

    expect(factory.createPrimary(ChainKey.ETHEREUM_MAINNET).getName()).toBe('eth-primary');
    expect(factory.createFallback(ChainKey.ETHEREUM_MAINNET).getName()).toBe('eth-fallback');
  });

  it('returns solana providers for solana chain key', (): void => {
    const ethereumPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('eth-primary');
    const ethereumFallback: IFallbackRpcAdapter = new FallbackAdapterStub('eth-fallback');
    const solanaPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('sol-primary');
    const solanaFallback: IFallbackRpcAdapter = new FallbackAdapterStub('sol-fallback');
    const tronPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('tron-primary');
    const tronFallback: IFallbackRpcAdapter = new FallbackAdapterStub('tron-fallback');

    const factory: ProviderFactory = new ProviderFactory(
      ethereumPrimary,
      ethereumFallback,
      solanaPrimary,
      solanaFallback,
      tronPrimary,
      tronFallback,
    );

    expect(factory.createPrimary(ChainKey.SOLANA_MAINNET).getName()).toBe('sol-primary');
    expect(factory.createFallback(ChainKey.SOLANA_MAINNET).getName()).toBe('sol-fallback');
  });

  it('returns tron providers for tron chain key', (): void => {
    const ethereumPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('eth-primary');
    const ethereumFallback: IFallbackRpcAdapter = new FallbackAdapterStub('eth-fallback');
    const solanaPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('sol-primary');
    const solanaFallback: IFallbackRpcAdapter = new FallbackAdapterStub('sol-fallback');
    const tronPrimary: IPrimaryRpcAdapter = new PrimaryAdapterStub('tron-primary');
    const tronFallback: IFallbackRpcAdapter = new FallbackAdapterStub('tron-fallback');

    const factory: ProviderFactory = new ProviderFactory(
      ethereumPrimary,
      ethereumFallback,
      solanaPrimary,
      solanaFallback,
      tronPrimary,
      tronFallback,
    );

    expect(factory.createPrimary(ChainKey.TRON_MAINNET).getName()).toBe('tron-primary');
    expect(factory.createFallback(ChainKey.TRON_MAINNET).getName()).toBe('tron-fallback');
  });
});
