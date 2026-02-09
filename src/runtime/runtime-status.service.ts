import { Injectable } from '@nestjs/common';

import type { WatcherRuntimeSnapshot } from './runtime-status.interfaces';

@Injectable()
export class RuntimeStatusService {
  private snapshot: WatcherRuntimeSnapshot = {
    observedBlock: null,
    processedBlock: null,
    lag: null,
    queueSize: 0,
    backoffMs: 0,
    confirmations: 0,
    updatedAtIso: null,
  };

  public setSnapshot(snapshot: WatcherRuntimeSnapshot): void {
    this.snapshot = snapshot;
  }

  public getSnapshot(): WatcherRuntimeSnapshot {
    return this.snapshot;
  }
}
