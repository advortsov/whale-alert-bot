export type HistoryCacheKey = {
  readonly address: string;
  readonly limit: number;
};

export type HistoryCacheEntry = {
  readonly key: HistoryCacheKey;
  readonly message: string;
  readonly createdAtEpochMs: number;
  readonly freshUntilEpochMs: number;
  readonly staleUntilEpochMs: number;
};
