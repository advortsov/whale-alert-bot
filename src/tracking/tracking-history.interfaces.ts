import type {
  IParsedHistoryQueryParams,
  ITrackingHistoryPageRequestDto,
} from './dto/tracking-history-request.dto';
import type { HistoryRequestSource } from './history-rate-limiter.interfaces';
import type { ChainKey } from '../core/chains/chain-key.interfaces';

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

export interface IOffsetHistoryPageContext {
  readonly target: IHistoryTargetSnapshot;
  readonly historyParams: IParsedHistoryQueryParams;
  readonly localEventsWithProbeCount: number;
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
