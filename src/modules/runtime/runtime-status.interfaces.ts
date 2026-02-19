import type { ChainKey } from '../../common/interfaces/chain-key.interfaces';

export type WatcherRuntimeSnapshot = {
  readonly observedBlock: number | null;
  readonly processedBlock: number | null;
  readonly lag: number | null;
  readonly queueSize: number;
  readonly backoffMs: number;
  readonly confirmations: number;
  readonly updatedAtIso: string | null;
};

export type ChainRuntimeEntry = {
  readonly chainKey: ChainKey;
  readonly observedBlock: number | null;
  readonly processedBlock: number | null;
  readonly lag: number | null;
  readonly queueSize: number;
  readonly backoffMs: number;
  readonly isDegradationMode: boolean;
  readonly updatedAtIso: string;
};

export type RuntimeTelemetry = {
  readonly byChain: Record<string, ChainRuntimeEntry>;
};
