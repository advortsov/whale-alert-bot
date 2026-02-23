import { type HistoryDirectionFilter, type HistoryKind } from './history-request.dto';
import type { IWalletHistoryListItem } from './wallet-history-list-item.dto';

export type HistoryPageResult = {
  readonly message: string;
  readonly resolvedAddress: string;
  readonly walletId: number | null;
  readonly limit: number;
  readonly offset: number;
  readonly kind: HistoryKind;
  readonly direction: HistoryDirectionFilter;
  readonly hasNextPage: boolean;
  readonly items: readonly IWalletHistoryListItem[];
  readonly nextOffset: number | null;
};
