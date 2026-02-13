import type { HistoryDirectionFilter, HistoryKind } from './history-request.dto';
import type { ChainKey } from '../../../core/chains/chain-key.interfaces';

export interface IHistoryFilterDto {
  readonly chainKey: ChainKey;
  readonly kind: HistoryKind;
  readonly direction: HistoryDirectionFilter;
  readonly minAmountUsd: number | null;
}
