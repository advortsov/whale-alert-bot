import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { ChainKey } from '../../core/chains/chain-key.interfaces';

interface IThrottleState {
  queueTail: Promise<void>;
  nextRequestAtMs: number;
  currentBackoffMs: number;
}

@Injectable()
export class RpcThrottlerService {
  private static readonly DEFAULT_THROTTLE_KEY: string = 'default';
  private readonly logger: Logger = new Logger(RpcThrottlerService.name);
  private readonly minIntervalMs: number;
  private readonly backoffBaseMs: number;
  private readonly solanaBackoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly throttleStatesByKey: Map<string, IThrottleState> = new Map<
    string,
    IThrottleState
  >();

  public constructor(private readonly appConfigService: AppConfigService) {
    this.minIntervalMs = this.appConfigService.chainRpcMinIntervalMs;
    this.backoffBaseMs = this.appConfigService.chainBackoffBaseMs;
    this.solanaBackoffBaseMs = this.appConfigService.chainSolanaBackoffBaseMs;
    this.backoffMaxMs = this.appConfigService.chainBackoffMaxMs;
  }

  public async schedule<T>(operation: () => Promise<T>): Promise<T> {
    return this.scheduleForKey(RpcThrottlerService.DEFAULT_THROTTLE_KEY, operation);
  }

  public async scheduleForKey<T>(throttleKey: string, operation: () => Promise<T>): Promise<T> {
    await this.waitForSlot(throttleKey);
    return operation();
  }

  public increaseBackoff(reason: string): void {
    this.increaseBackoffForKey(RpcThrottlerService.DEFAULT_THROTTLE_KEY, reason);
  }

  public increaseBackoffForKey(throttleKey: string, reason: string): void {
    const state: IThrottleState = this.getOrCreateState(throttleKey);
    const baseBackoffMs: number = this.getBaseBackoffMsForKey(throttleKey);
    const nextBackoffMs: number =
      state.currentBackoffMs === 0
        ? baseBackoffMs
        : Math.min(state.currentBackoffMs * 2, this.backoffMaxMs);

    if (nextBackoffMs === state.currentBackoffMs) {
      return;
    }

    state.currentBackoffMs = nextBackoffMs;
    this.logger.warn(
      `RPC backoff increased to ${state.currentBackoffMs}ms, key=${throttleKey}, reason=${reason}`,
    );
  }

  public resetBackoff(): void {
    this.resetBackoffForKey(RpcThrottlerService.DEFAULT_THROTTLE_KEY);
  }

  public resetBackoffForKey(throttleKey: string): void {
    const state: IThrottleState = this.getOrCreateState(throttleKey);

    if (state.currentBackoffMs === 0) {
      return;
    }

    this.logger.log(
      `RPC backoff reset from ${state.currentBackoffMs}ms to 0ms, key=${throttleKey}`,
    );
    state.currentBackoffMs = 0;
  }

  public getCurrentBackoffMs(): number {
    return this.getCurrentBackoffMsForKey(RpcThrottlerService.DEFAULT_THROTTLE_KEY);
  }

  public getCurrentBackoffMsForKey(throttleKey: string): number {
    const state: IThrottleState = this.getOrCreateState(throttleKey);
    return state.currentBackoffMs;
  }

  private async waitForSlot(throttleKey: string): Promise<void> {
    const state: IThrottleState = this.getOrCreateState(throttleKey);
    const deferredSlot = this.createDeferred();
    const previousSlot: Promise<void> = state.queueTail;

    state.queueTail = deferredSlot.promise;

    await previousSlot;

    const nowMs: number = Date.now();
    const waitMs: number = Math.max(state.nextRequestAtMs - nowMs, 0);

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }

    const startedAtMs: number = Date.now();
    state.nextRequestAtMs = startedAtMs + this.minIntervalMs + state.currentBackoffMs;

    deferredSlot.resolve();
  }

  private getOrCreateState(throttleKey: string): IThrottleState {
    const existingState: IThrottleState | undefined = this.throttleStatesByKey.get(throttleKey);

    if (existingState !== undefined) {
      return existingState;
    }

    const createdState: IThrottleState = {
      queueTail: Promise.resolve(),
      nextRequestAtMs: 0,
      currentBackoffMs: 0,
    };
    this.throttleStatesByKey.set(throttleKey, createdState);
    return createdState;
  }

  private getBaseBackoffMsForKey(throttleKey: string): number {
    if (throttleKey.includes(`:${ChainKey.SOLANA_MAINNET}`)) {
      return this.solanaBackoffBaseMs;
    }

    return this.backoffBaseMs;
  }

  private async sleep(waitMs: number): Promise<void> {
    await new Promise<void>((resolve: () => void): void => {
      setTimeout((): void => {
        resolve();
      }, waitMs);
    });
  }

  private createDeferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
    let resolveFn: () => void = (): void => undefined;
    const promise: Promise<void> = new Promise<void>((resolve: () => void): void => {
      resolveFn = resolve;
    });

    return {
      promise,
      resolve: resolveFn,
    };
  }
}
