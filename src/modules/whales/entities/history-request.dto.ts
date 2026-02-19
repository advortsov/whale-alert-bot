import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';

export enum HistoryKind {
  ALL = 'all',
  ETH = 'eth',
  ERC20 = 'erc20',
}

export enum HistoryDirectionFilter {
  ALL = 'all',
  IN = 'in',
  OUT = 'out',
}

export interface IHistoryRequestDto {
  readonly chainKey: ChainKey;
  readonly address: string;
  readonly limit: number;
  readonly offset: number;
  readonly kind: HistoryKind;
  readonly direction: HistoryDirectionFilter;
  readonly minAmountUsd: number | null;
}
