import type { ChainKey } from '../../chains/chain-key.interfaces';

export enum QueueOverflowPolicy {
  DROP_OLDEST_WINDOW = 'drop_oldest_window',
  KEEP_TAIL_WINDOW = 'keep_tail_window',
}

export enum CatchupPolicy {
  BOUNDED = 'bounded',
}

export interface ChainStreamTuning {
  readonly chainKey: ChainKey;
  readonly queueMax: number;
  readonly catchupBatch: number;
  readonly pollIntervalMs: number;
  readonly queueOverflowPolicy: QueueOverflowPolicy;
  readonly catchupPolicy: CatchupPolicy;
}
