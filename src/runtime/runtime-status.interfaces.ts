export type WatcherRuntimeSnapshot = {
  readonly observedBlock: number | null;
  readonly processedBlock: number | null;
  readonly lag: number | null;
  readonly queueSize: number;
  readonly backoffMs: number;
  readonly confirmations: number;
  readonly updatedAtIso: string | null;
};
