import { Injectable, Logger } from '@nestjs/common';

import { ChainId } from '../chain.types';
import { ProviderFactory } from './provider.factory';
import { RpcThrottlerService } from './rpc-throttler.service';
import type {
  IFallbackRpcProvider,
  IPrimaryRpcProvider,
  IProviderFailoverService,
  ProviderOperation,
} from '../interfaces/rpc-provider.interface';

@Injectable()
export class ProviderFailoverService implements IProviderFailoverService {
  private readonly logger: Logger = new Logger(ProviderFailoverService.name);

  public constructor(
    private readonly providerFactory: ProviderFactory,
    private readonly rpcThrottlerService: RpcThrottlerService,
  ) {}

  public async execute<T>(operation: ProviderOperation<T>): Promise<T> {
    const primaryProvider: IPrimaryRpcProvider = this.providerFactory.createPrimary(
      ChainId.ETHEREUM_MAINNET,
    );

    try {
      const primaryResult: T = await this.rpcThrottlerService.schedule(
        async (): Promise<T> => operation(primaryProvider),
      );
      this.rpcThrottlerService.resetBackoff();
      return primaryResult;
    } catch (primaryError: unknown) {
      const primaryErrorMessage: string =
        primaryError instanceof Error ? primaryError.message : String(primaryError);
      this.applyBackoffIfNeeded(primaryError, `primary:${primaryProvider.getName()}`);
      this.logger.warn(`Primary provider failed: ${primaryErrorMessage}. Switching to fallback.`);

      const fallbackProvider: IFallbackRpcProvider = this.providerFactory.createFallback(
        ChainId.ETHEREUM_MAINNET,
      );

      try {
        const fallbackResult: T = await this.rpcThrottlerService.schedule(
          async (): Promise<T> => operation(fallbackProvider),
        );
        this.rpcThrottlerService.resetBackoff();
        return fallbackResult;
      } catch (fallbackError: unknown) {
        const fallbackErrorMessage: string =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

        this.applyBackoffIfNeeded(fallbackError, `fallback:${fallbackProvider.getName()}`);
        throw new Error(
          `Primary and fallback providers failed. primary="${primaryErrorMessage}", fallback="${fallbackErrorMessage}"`,
        );
      }
    }
  }

  public getCurrentBackoffMs(): number {
    return this.rpcThrottlerService.getCurrentBackoffMs();
  }

  private applyBackoffIfNeeded(error: unknown, source: string): void {
    if (!this.isRateLimitOrTimeoutError(error)) {
      return;
    }

    this.rpcThrottlerService.increaseBackoff(source);
  }

  private isRateLimitOrTimeoutError(error: unknown): boolean {
    const normalizedMessage: string = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();

    const rateLimitPatterns: readonly string[] = [
      '429',
      'rate limit',
      'too many requests',
      'request limit',
      'timeout',
      'timed out',
      'etimedout',
      'socket hang up',
      'econnreset',
      'service unavailable',
      '-32005',
    ];

    return rateLimitPatterns.some((pattern: string): boolean =>
      normalizedMessage.includes(pattern),
    );
  }
}
