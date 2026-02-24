import type { HistoryRequestSource } from './history-rate-limiter.interfaces';
import type { IParsedHistoryQueryParams } from './tracking-history-request.dto';
import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { WalletEventHistoryView } from '../../../database/repositories/wallet-events.repository.interfaces';

export interface IHistoryUserRef {
  readonly telegramId: string;
  readonly username: string | null;
}

export interface IHistoryTargetSnapshot {
  readonly address: string;
  readonly walletId: number | null;
  readonly chainKey: ChainKey;
}

export interface IRateLimitedHistoryContext {
  readonly telegramId: string;
  readonly source: HistoryRequestSource;
  readonly normalizedAddress: string;
  readonly historyParams: IParsedHistoryQueryParams;
}

export interface ILoadHistoryWithFallbackContext {
  readonly telegramId: string;
  readonly source: HistoryRequestSource;
  readonly chainKey: ChainKey;
  readonly normalizedAddress: string;
  readonly historyParams: IParsedHistoryQueryParams;
}

export interface ILocalHistoryPageContext {
  readonly chainKey: ChainKey;
  readonly normalizedAddress: string;
  readonly historyParams: IParsedHistoryQueryParams;
}

export interface ILocalHistoryPageData {
  readonly pageEvents: readonly WalletEventHistoryView[];
  readonly hasNextPage: boolean;
  readonly nextOffset: number | null;
}
