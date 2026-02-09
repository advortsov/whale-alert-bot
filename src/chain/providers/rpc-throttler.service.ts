import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class RpcThrottlerService {
  private readonly logger: Logger = new Logger(RpcThrottlerService.name);
  private readonly minIntervalMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;

  private queueTail: Promise<void> = Promise.resolve();
  private nextRequestAtMs: number = 0;
  private currentBackoffMs: number = 0;

  public constructor(private readonly appConfigService: AppConfigService) {
    this.minIntervalMs = this.appConfigService.chainRpcMinIntervalMs;
    this.backoffBaseMs = this.appConfigService.chainBackoffBaseMs;
    this.backoffMaxMs = this.appConfigService.chainBackoffMaxMs;
  }

  public async schedule<T>(operation: () => Promise<T>): Promise<T> {
    await this.waitForSlot();
    return operation();
  }

  public increaseBackoff(reason: string): void {
    const nextBackoffMs: number =
      this.currentBackoffMs === 0
        ? this.backoffBaseMs
        : Math.min(this.currentBackoffMs * 2, this.backoffMaxMs);

    if (nextBackoffMs === this.currentBackoffMs) {
      return;
    }

    this.currentBackoffMs = nextBackoffMs;
    this.logger.warn(`RPC backoff increased to ${this.currentBackoffMs}ms, reason=${reason}`);
  }

  public resetBackoff(): void {
    if (this.currentBackoffMs === 0) {
      return;
    }

    this.logger.log(`RPC backoff reset from ${this.currentBackoffMs}ms to 0ms`);
    this.currentBackoffMs = 0;
  }

  public getCurrentBackoffMs(): number {
    return this.currentBackoffMs;
  }

  private async waitForSlot(): Promise<void> {
    const deferredSlot = this.createDeferred();
    const previousSlot: Promise<void> = this.queueTail;

    this.queueTail = deferredSlot.promise;

    await previousSlot;

    const nowMs: number = Date.now();
    const waitMs: number = Math.max(this.nextRequestAtMs - nowMs, 0);

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }

    const startedAtMs: number = Date.now();
    this.nextRequestAtMs = startedAtMs + this.minIntervalMs + this.currentBackoffMs;

    deferredSlot.resolve();
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
