export class RateLimitedWarningEmitter {
  private readonly warningTimestamps: Map<string, number> = new Map<string, number>();

  public constructor(private readonly cooldownMs: number) {}

  public shouldEmit(key: string): boolean {
    const nowMs: number = Date.now();
    const lastMs: number | undefined = this.warningTimestamps.get(key);
    if (lastMs !== undefined && nowMs - lastMs < this.cooldownMs) {
      return false;
    }
    this.warningTimestamps.set(key, nowMs);
    return true;
  }
}
