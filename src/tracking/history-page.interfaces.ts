export type HistoryPageResult = {
  readonly message: string;
  readonly resolvedAddress: string;
  readonly walletId: number | null;
  readonly limit: number;
  readonly offset: number;
  readonly hasNextPage: boolean;
};
