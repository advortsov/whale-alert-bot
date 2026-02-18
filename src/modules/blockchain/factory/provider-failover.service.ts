import { Injectable, Logger } from '@nestjs/common';

import { ProviderFactory } from './provider.factory';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import type {
  IFallbackRpcAdapter,
  IPrimaryRpcAdapter,
  IProviderFailoverService,
  ProviderOperation,
} from '../base/rpc-adapter.interfaces';
import { LimiterKey, RequestPriority } from '../rate-limiting/bottleneck-rate-limiter.interfaces';
import { BottleneckRateLimiterService } from '../rate-limiting/bottleneck-rate-limiter.service';

const PRIMARY_BACKOFF_RESET_SUCCESS_STREAK = 3;

interface IBackoffState {
  currentBackoffMs: number;
}

interface IFallbackOnlyOptions<T> {
  readonly fallbackLimiterKey: LimiterKey;
  readonly fallbackBackoffKey: string;
  readonly chainKey: ChainKey;
  readonly fallbackProvider: IFallbackRpcAdapter;
  readonly operation: ProviderOperation<T>;
  readonly priority: RequestPriority;
}

@Injectable()
export class ProviderFailoverService implements IProviderFailoverService {
  private readonly logger: Logger = new Logger(ProviderFailoverService.name);
  private readonly primaryCooldownUntilByChain: Map<ChainKey, number> = new Map<ChainKey, number>();
  private readonly primarySuccessStreakByChain: Map<ChainKey, number> = new Map<ChainKey, number>();
  private readonly backoffStates: Map<string, IBackoffState> = new Map<string, IBackoffState>();
  private readonly backoffBaseMs: number;
  private readonly solanaBackoffBaseMs: number;
  private readonly backoffMaxMs: number;

  public constructor(
    private readonly providerFactory: ProviderFactory,
    private readonly rateLimiterService: BottleneckRateLimiterService,
    private readonly appConfigService: AppConfigService,
  ) {
    this.backoffBaseMs = this.appConfigService.chainBackoffBaseMs;
    this.solanaBackoffBaseMs = this.appConfigService.chainSolanaBackoffBaseMs;
    this.backoffMaxMs = this.appConfigService.chainBackoffMaxMs;
  }

  public async execute<T>(operation: ProviderOperation<T>): Promise<T> {
    return this.executeForChain(ChainKey.ETHEREUM_MAINNET, operation);
  }

  public async executeForChain<T>(
    chainKey: ChainKey,
    operation: ProviderOperation<T>,
    priority: RequestPriority = RequestPriority.NORMAL,
  ): Promise<T> {
    const primaryLimiterKey: LimiterKey = this.getPrimaryLimiterKey(chainKey);
    const fallbackLimiterKey: LimiterKey = this.getFallbackLimiterKey(chainKey);
    const primaryBackoffKey: string = `primary:${chainKey}`;
    const fallbackBackoffKey: string = `fallback:${chainKey}`;

    if (this.isPrimaryOnCooldown(chainKey)) {
      const fallbackProvider: IFallbackRpcAdapter = this.providerFactory.createFallback(chainKey);

      return this.executeFallbackOnly({
        fallbackLimiterKey,
        fallbackBackoffKey,
        chainKey,
        fallbackProvider,
        operation,
        priority,
      });
    }

    const primaryProvider: IPrimaryRpcAdapter = this.providerFactory.createPrimary(chainKey);

    try {
      const primaryResult: T = await this.rateLimiterService.schedule(
        primaryLimiterKey,
        async (): Promise<T> => operation(primaryProvider),
        priority,
      );
      this.handlePrimarySuccess(chainKey, primaryBackoffKey);
      return primaryResult;
    } catch (primaryError: unknown) {
      const primaryErrorMessage: string =
        primaryError instanceof Error ? primaryError.message : String(primaryError);
      this.primarySuccessStreakByChain.delete(chainKey);
      this.applyPrimaryBackoffIfNeeded(
        primaryBackoffKey,
        chainKey,
        primaryError,
        `primary:${primaryProvider.getName()}`,
      );
      this.logger.warn(
        `Primary provider failed: chain=${chainKey}, ${primaryErrorMessage}. Switching to fallback.`,
      );

      const fallbackProvider: IFallbackRpcAdapter = this.providerFactory.createFallback(chainKey);

      try {
        const fallbackResult: T = await this.rateLimiterService.schedule(
          fallbackLimiterKey,
          async (): Promise<T> => operation(fallbackProvider),
          priority,
        );
        this.resetBackoff(fallbackBackoffKey);
        return fallbackResult;
      } catch (fallbackError: unknown) {
        const fallbackErrorMessage: string =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);

        this.applyFallbackBackoffIfNeeded(
          fallbackBackoffKey,
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
    const primaryBackoffMs: number = this.getBackoffMs(`primary:${chainKey}`);
    const fallbackBackoffMs: number = this.getBackoffMs(`fallback:${chainKey}`);
    return Math.max(primaryBackoffMs, fallbackBackoffMs);
  }

  private async executeFallbackOnly<T>(options: IFallbackOnlyOptions<T>): Promise<T> {
    const {
      fallbackLimiterKey,
      fallbackBackoffKey,
      chainKey,
      fallbackProvider,
      operation,
      priority,
    } = options;

    try {
      return await this.rateLimiterService.schedule(
        fallbackLimiterKey,
        async (): Promise<T> => operation(fallbackProvider),
        priority,
      );
    } catch (fallbackError: unknown) {
      const fallbackErrorMessage: string =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      this.applyFallbackBackoffIfNeeded(
        fallbackBackoffKey,
        fallbackError,
        `fallback:${fallbackProvider.getName()}`,
      );
      throw new Error(
        `Fallback provider failed while primary is on cooldown. chain=${chainKey}, fallback="${fallbackErrorMessage}"`,
      );
    }
  }

  private applyPrimaryBackoffIfNeeded(
    backoffKey: string,
    chainKey: ChainKey,
    error: unknown,
    source: string,
  ): void {
    if (!this.isRateLimitOrTimeoutError(error)) {
      return;
    }

    this.increaseBackoff(backoffKey, chainKey, source);
    this.updatePrimaryCooldownByBackoff(chainKey, backoffKey);
  }

  private applyFallbackBackoffIfNeeded(backoffKey: string, error: unknown, source: string): void {
    if (!this.isRateLimitOrTimeoutError(error)) {
      return;
    }

    this.increaseBackoff(backoffKey, null, source);
  }

  private increaseBackoff(backoffKey: string, chainKey: ChainKey | null, reason: string): void {
    const state: IBackoffState = this.getOrCreateBackoffState(backoffKey);
    const baseBackoffMs: number = this.getBaseBackoffMs(backoffKey);
    const nextBackoffMs: number =
      state.currentBackoffMs === 0
        ? baseBackoffMs
        : Math.min(state.currentBackoffMs * 2, this.backoffMaxMs);

    if (nextBackoffMs === state.currentBackoffMs) {
      return;
    }

    state.currentBackoffMs = nextBackoffMs;
    this.logger.warn(
      `RPC backoff increased to ${state.currentBackoffMs}ms, key=${backoffKey}, reason=${reason}`,
    );
  }

  private resetBackoff(backoffKey: string): void {
    const state: IBackoffState | undefined = this.backoffStates.get(backoffKey);

    if (state === undefined || state.currentBackoffMs === 0) {
      return;
    }

    this.logger.log(`RPC backoff reset from ${state.currentBackoffMs}ms to 0ms, key=${backoffKey}`);
    state.currentBackoffMs = 0;
  }

  private getBackoffMs(backoffKey: string): number {
    return this.backoffStates.get(backoffKey)?.currentBackoffMs ?? 0;
  }

  private getOrCreateBackoffState(backoffKey: string): IBackoffState {
    const existing: IBackoffState | undefined = this.backoffStates.get(backoffKey);

    if (existing !== undefined) {
      return existing;
    }

    const created: IBackoffState = { currentBackoffMs: 0 };
    this.backoffStates.set(backoffKey, created);
    return created;
  }

  private getBaseBackoffMs(backoffKey: string): number {
    if (backoffKey.includes(`:${ChainKey.SOLANA_MAINNET}`)) {
      return this.solanaBackoffBaseMs;
    }

    return this.backoffBaseMs;
  }

  private updatePrimaryCooldownByBackoff(chainKey: ChainKey, backoffKey: string): void {
    const backoffMs: number = this.getBackoffMs(backoffKey);

    if (backoffMs <= 0) {
      return;
    }

    this.primaryCooldownUntilByChain.set(chainKey, Date.now() + backoffMs);
  }

  private clearPrimaryCooldown(chainKey: ChainKey): void {
    this.primaryCooldownUntilByChain.delete(chainKey);
  }

  private handlePrimarySuccess(chainKey: ChainKey, backoffKey: string): void {
    this.clearPrimaryCooldown(chainKey);
    const currentBackoffMs: number = this.getBackoffMs(backoffKey);

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

    if (nextSuccessStreak < PRIMARY_BACKOFF_RESET_SUCCESS_STREAK) {
      return;
    }

    this.resetBackoff(backoffKey);
    this.primarySuccessStreakByChain.delete(chainKey);
    this.logger.log(
      `Primary backoff reset after ${String(PRIMARY_BACKOFF_RESET_SUCCESS_STREAK)} consecutive successful calls. chain=${chainKey}`,
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

  private getPrimaryLimiterKey(chainKey: ChainKey): LimiterKey {
    switch (chainKey) {
      case ChainKey.ETHEREUM_MAINNET:
        return LimiterKey.ETHEREUM_PRIMARY;
      case ChainKey.SOLANA_MAINNET:
        return LimiterKey.SOLANA_HELIUS;
      case ChainKey.TRON_MAINNET:
        return LimiterKey.TRON_GRID;
    }
  }

  private getFallbackLimiterKey(chainKey: ChainKey): LimiterKey {
    switch (chainKey) {
      case ChainKey.ETHEREUM_MAINNET:
        return LimiterKey.ETHEREUM_FALLBACK;
      case ChainKey.SOLANA_MAINNET:
        return LimiterKey.SOLANA_PUBLIC;
      case ChainKey.TRON_MAINNET:
        return LimiterKey.TRON_PUBLIC;
    }
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
