import {
  type HistoryDirectionFilter,
  type HistoryKind,
} from '../features/tracking/dto/history-request.dto';

export type HistoryPageResult = {
  readonly message: string;
  readonly resolvedAddress: string;
  readonly walletId: number | null;
  readonly limit: number;
  readonly offset: number;
  readonly kind: HistoryKind;
  readonly direction: HistoryDirectionFilter;
  readonly hasNextPage: boolean;
};
