import { Injectable, Logger } from '@nestjs/common';

import { ProviderFactory } from './provider.factory';
import { RpcThrottlerService } from './rpc-throttler.service';
import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type {
  IFallbackRpcAdapter,
  IPrimaryRpcAdapter,
  IProviderFailoverService,
  ProviderOperation,
} from '../../core/ports/rpc/rpc-adapter.interfaces';

@Injectable()
export class ProviderFailoverService implements IProviderFailoverService {
  private static readonly PRIMARY_BACKOFF_RESET_SUCCESS_STREAK: number = 3;
  private readonly logger: Logger = new Logger(ProviderFailoverService.name);
  private readonly primaryCooldownUntilByChain: Map<ChainKey, number> = new Map<ChainKey, number>();
  private readonly primarySuccessStreakByChain: Map<ChainKey, number> = new Map<ChainKey, number>();

  public constructor(
    private readonly providerFactory: ProviderFactory,
    private readonly rpcThrottlerService: RpcThrottlerService,
  ) {}

  public async execute<T>(operation: ProviderOperation<T>): Promise<T> {
    return this.executeForChain(ChainKey.ETHEREUM_MAINNET, operation);
  }

  public async executeForChain<T>(chainKey: ChainKey, operation: ProviderOperation<T>): Promise<T> {
    const primaryThrottleKey: string = this.getPrimaryThrottleKey(chainKey);
    const fallbackThrottleKey: string = this.getFallbackThrottleKey(chainKey);

    if (this.isPrimaryOnCooldown(chainKey)) {
      const fallbackProvider: IFallbackRpcAdapter = this.providerFactory.createFallback(chainKey);

      return this.executeFallbackOnly(fallbackThrottleKey, chainKey, fallbackProvider, operation);
    }

    const primaryProvider: IPrimaryRpcAdapter = this.providerFactory.createPrimary(chainKey);

    try {
      const primaryResult: T = await this.rpcThrottlerService.scheduleForKey(
        primaryThrottleKey,
        async (): Promise<T> => operation(primaryProvider),
      );
      this.handlePrimarySuccess(chainKey, primaryThrottleKey);
      return primaryResult;
    } catch (primaryError: unknown) {
      const primaryErrorMessage: string =
        primaryError instanceof Error ? primaryError.message : String(primaryError);
      this.primarySuccessStreakByChain.delete(chainKey);
      this.applyPrimaryBackoffIfNeeded(
        primaryThrottleKey,
        chainKey,
        primaryError,
        `primary:${primaryProvider.getName()}`,
      );
      this.logger.warn(
        `Primary provider failed: chain=${chainKey}, ${primaryErrorMessage}. Switching to fallback.`,
      );

      const fallbackProvider: IFallbackRpcAdapter = this.providerFactory.createFallback(chainKey);

      try {
        const fallbackResult: T = await this.rpcThrottlerService.scheduleForKey(
          fallbackThrottleKey,
          async (): Promise<T> => operation(fallbackProvider),
        );
        this.rpcThrottlerService.resetBackoffForKey(fallbackThrottleKey);
        return fallbackResult;
      } catch (fallbackError: unknown) {
        const fallbackErrorMessage: string =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

        this.applyFallbackBackoffIfNeeded(
          fallbackThrottleKey,
          fallbackError,
          `fallback:${fallbackProvider.getName()}`,
        );
        throw new Error(
          `Primary and fallback providers failed. primary="${primaryErrorMessage}", fallback="${fallbackErrorMessage}"`,
        );
      }
    }
  }

  public getCurrentBackoffMs(chainKey: ChainKey = ChainKey.ETHEREUM_MAINNET): number {
    const primaryBackoffMs: number = this.rpcThrottlerService.getCurrentBackoffMsForKey(
      this.getPrimaryThrottleKey(chainKey),
    );
    const fallbackBackoffMs: number = this.rpcThrottlerService.getCurrentBackoffMsForKey(
      this.getFallbackThrottleKey(chainKey),
    );
    return Math.max(primaryBackoffMs, fallbackBackoffMs);
  }

  private async executeFallbackOnly<T>(
    fallbackThrottleKey: string,
    chainKey: ChainKey,
    fallbackProvider: IFallbackRpcAdapter,
    operation: ProviderOperation<T>,
  ): Promise<T> {
    try {
      return await this.rpcThrottlerService.scheduleForKey(
        fallbackThrottleKey,
        async (): Promise<T> => operation(fallbackProvider),
      );
    } catch (fallbackError: unknown) {
      const fallbackErrorMessage: string =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      this.applyFallbackBackoffIfNeeded(
        fallbackThrottleKey,
        fallbackError,
        `fallback:${fallbackProvider.getName()}`,
      );
      throw new Error(
        `Fallback provider failed while primary is on cooldown. chain=${chainKey}, fallback="${fallbackErrorMessage}"`,
      );
    }
  }

  private applyPrimaryBackoffIfNeeded(
    primaryThrottleKey: string,
    chainKey: ChainKey,
    error: unknown,
    source: string,
  ): void {
    if (!this.isRateLimitOrTimeoutError(error)) {
      return;
    }

    this.rpcThrottlerService.increaseBackoffForKey(primaryThrottleKey, source);
    this.updatePrimaryCooldownByBackoff(chainKey, primaryThrottleKey);
  }

  private applyFallbackBackoffIfNeeded(
    fallbackThrottleKey: string,
    error: unknown,
    source: string,
  ): void {
    if (!this.isRateLimitOrTimeoutError(error)) {
      return;
    }

    this.rpcThrottlerService.increaseBackoffForKey(fallbackThrottleKey, source);
  }

  private updatePrimaryCooldownByBackoff(chainKey: ChainKey, primaryThrottleKey: string): void {
    const backoffMs: number =
      this.rpcThrottlerService.getCurrentBackoffMsForKey(primaryThrottleKey);

    if (backoffMs <= 0) {
      return;
    }

    this.primaryCooldownUntilByChain.set(chainKey, Date.now() + backoffMs);
  }

  private clearPrimaryCooldown(chainKey: ChainKey): void {
    this.primaryCooldownUntilByChain.delete(chainKey);
  }

  private handlePrimarySuccess(chainKey: ChainKey, primaryThrottleKey: string): void {
    this.clearPrimaryCooldown(chainKey);
    const currentBackoffMs: number =
      this.rpcThrottlerService.getCurrentBackoffMsForKey(primaryThrottleKey);

    if (currentBackoffMs <= 0) {
      this.primarySuccessStreakByChain.delete(chainKey);
      return;
    }

    if (chainKey === ChainKey.SOLANA_MAINNET) {
      this.primarySuccessStreakByChain.delete(chainKey);
      return;
    }

    const nextSuccessStreak: number = (this.primarySuccessStreakByChain.get(chainKey) ?? 0) + 1;
    this.primarySuccessStreakByChain.set(chainKey, nextSuccessStreak);

    if (nextSuccessStreak < ProviderFailoverService.PRIMARY_BACKOFF_RESET_SUCCESS_STREAK) {
      return;
    }

    this.rpcThrottlerService.resetBackoffForKey(primaryThrottleKey);
    this.primarySuccessStreakByChain.delete(chainKey);
    this.logger.log(
      `Primary backoff reset after ${String(ProviderFailoverService.PRIMARY_BACKOFF_RESET_SUCCESS_STREAK)} consecutive successful calls. chain=${chainKey}`,
    );
  }

  private isPrimaryOnCooldown(chainKey: ChainKey): boolean {
    const cooldownUntilMs: number | undefined = this.primaryCooldownUntilByChain.get(chainKey);

    if (cooldownUntilMs === undefined) {
      return false;
    }

    if (Date.now() >= cooldownUntilMs) {
      this.primaryCooldownUntilByChain.delete(chainKey);
      return false;
    }

    return true;
  }

  private getPrimaryThrottleKey(chainKey: ChainKey): string {
    return `primary:${chainKey}`;
  }

  private getFallbackThrottleKey(chainKey: ChainKey): string {
    return `fallback:${chainKey}`;
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
