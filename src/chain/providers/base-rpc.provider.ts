import { Logger } from '@nestjs/common';
import {
  WebSocketProvider,
  type Block,
  type TransactionReceipt,
  type TransactionResponse,
} from 'ethers';

import type {
  BlockHandler,
  ISubscriptionHandle,
  ProviderHealth,
  IRpcProvider,
} from '../interfaces/rpc-provider.interface';

abstract class BaseRpcProvider implements IRpcProvider {
  private provider: WebSocketProvider | null = null;
  private readonly logger: Logger;

  private socketListenersAttached: boolean = false;

  protected constructor(
    private readonly providerUrl: string | null,
    private readonly providerName: string,
  ) {
    this.logger = new Logger(providerName);
  }

  public getName(): string {
    return this.providerName;
  }

  public async subscribeBlocks(handler: BlockHandler): Promise<ISubscriptionHandle> {
    const wsProvider: WebSocketProvider = this.getOrCreateProvider();

    const listener = (blockNumber: number): void => {
      void handler(blockNumber).catch((error: unknown): void => {
        const errorMessage: string = error instanceof Error ? error.message : String(error);
        this.logger.error(`Block handler failed: ${errorMessage}`);
      });
    };

    void wsProvider.on('block', listener);

    return {
      stop: async (): Promise<void> => {
        void wsProvider.off('block', listener);
      },
    };
  }

  public async getBlock(blockNumber: number): Promise<Block | null> {
    const wsProvider: WebSocketProvider = this.getOrCreateProvider();
    return wsProvider.getBlock(blockNumber);
  }

  public async getTransaction(txHash: string): Promise<TransactionResponse | null> {
    const wsProvider: WebSocketProvider = this.getOrCreateProvider();
    return wsProvider.getTransaction(txHash);
  }

  public async getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
    const wsProvider: WebSocketProvider = this.getOrCreateProvider();
    return wsProvider.getTransactionReceipt(txHash);
  }

  public async healthCheck(): Promise<ProviderHealth> {
    if (!this.providerUrl) {
      return {
        provider: this.providerName,
        ok: false,
        details: 'Provider URL is not configured',
      };
    }

    try {
      const wsProvider: WebSocketProvider = this.getOrCreateProvider();
      await wsProvider.getBlockNumber();

      return {
        provider: this.providerName,
        ok: true,
        details: 'reachable',
      };
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);

      return {
        provider: this.providerName,
        ok: false,
        details: errorMessage,
      };
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.provider) {
      return;
    }

    void this.provider.destroy();
    this.provider = null;
  }

  private getOrCreateProvider(): WebSocketProvider {
    if (!this.providerUrl) {
      throw new Error(`Provider URL is missing for ${this.providerName}`);
    }

    this.provider ??= new WebSocketProvider(this.providerUrl);
    this.attachSocketErrorHandlers(this.provider);

    return this.provider;
  }

  private attachSocketErrorHandlers(provider: WebSocketProvider): void {
    if (this.socketListenersAttached) {
      return;
    }

    type SocketWithOn = {
      on: (event: string, listener: (...args: readonly unknown[]) => void) => void;
    };

    const maybeSocket: unknown = (
      provider as unknown as {
        websocket?: unknown;
      }
    ).websocket;

    if (!maybeSocket || typeof maybeSocket !== 'object' || !('on' in maybeSocket)) {
      return;
    }

    const socket: SocketWithOn = maybeSocket as SocketWithOn;

    socket.on('error', (error: unknown): void => {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(`WebSocket error: ${errorMessage}`);
      this.provider = null;
    });

    socket.on('close', (): void => {
      this.logger.warn('WebSocket closed. Provider will reconnect on next request.');
      this.provider = null;
    });

    this.socketListenersAttached = true;
  }
}

export { BaseRpcProvider };
