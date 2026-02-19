import type { HistoryRequestSource } from './history-rate-limiter.interfaces';
import type {
  IParsedHistoryQueryParams,
  ITrackingHistoryPageRequestDto,
} from './tracking-history-request.dto';
import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';

export interface IHistoryUserRef {
  readonly telegramId: string;
  readonly username: string | null;
}

export interface IHistoryTargetSnapshot {
  readonly address: string;
  readonly walletId: number | null;
  readonly chainKey: ChainKey;
}

export interface IFirstHistoryPageContext {
  readonly userRef: IHistoryUserRef;
  readonly request: ITrackingHistoryPageRequestDto;
  readonly target: IHistoryTargetSnapshot;
  readonly historyParams: IParsedHistoryQueryParams;
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
