import { type HistoryRequestSource } from './history-rate-limiter.interfaces';
import { type HistoryDirectionFilter, type HistoryKind } from './history-request.dto';

export interface ITrackingHistoryRequestDto {
  readonly rawAddress: string;
  readonly rawLimit: string | null;
  readonly source: HistoryRequestSource;
  readonly rawKind: string | null;
  readonly rawDirection: string | null;
}

export interface ITrackingHistoryPageRequestDto {
  readonly rawAddress: string;
  readonly rawLimit: string | null;
  readonly rawOffset: string | null;
  readonly source: HistoryRequestSource;
  readonly rawKind: string | null;
  readonly rawDirection: string | null;
}

export interface IParsedHistoryQueryParams {
  readonly limit: number;
  readonly offset: number;
  readonly kind: HistoryKind;
  readonly direction: HistoryDirectionFilter;
}
