import type {
  HistoryDirectionFilter,
  HistoryKind,
} from '../features/tracking/dto/history-request.dto';

export type HistoryCacheKey = {
  readonly address: string;
  readonly limit: number;
  readonly kind: HistoryKind;
  readonly direction: HistoryDirectionFilter;
};

export type HistoryCacheEntry = {
  readonly key: HistoryCacheKey;
  readonly message: string;
  readonly createdAtEpochMs: number;
  readonly freshUntilEpochMs: number;
  readonly staleUntilEpochMs: number;
};
