import type { ITronGridListResponse } from './tron-grid-history.interfaces';
import { LimiterKey } from '../../../modules/blockchain/rate-limiting/bottleneck-rate-limiter.interfaces';

export interface ITronGridPageRequestOptions {
  readonly path: string;
  readonly pageSize: number;
  readonly fingerprint: string | null;
}

export interface ITronGridPageLoadResult<TItem> {
  readonly items: readonly TItem[];
  readonly nextFingerprint: string | null;
}

export interface ITronGridFallbackResult {
  readonly payload: ITronGridListResponse<unknown>;
  readonly resolvedPolicy: ITronGridRequestQueryPolicy;
}

export interface ITronGridRequestQueryPolicy {
  readonly includeOnlyConfirmed: boolean;
  readonly includeOrderBy: boolean;
}

export const TRON_HISTORY_REQUEST_TIMEOUT_MS = 10_000;
export const TRON_HISTORY_MAX_ATTEMPTS = 4;
export const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
export const TRON_MAX_PAGE_SIZE = 200;
export const TRON_MAX_PAGE_REQUESTS = 20;
export const HTTP_STATUS_BAD_REQUEST = 400;
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
export const RESPONSE_PREVIEW_MAX_LENGTH = 300;
export const HISTORY_WARN_COOLDOWN_MS = 30_000;

export const QUERY_POLICIES: readonly ITronGridRequestQueryPolicy[] = [
  {
    includeOnlyConfirmed: true,
    includeOrderBy: true,
  },
  {
    includeOnlyConfirmed: true,
    includeOrderBy: false,
  },
  {
    includeOnlyConfirmed: false,
    includeOrderBy: false,
  },
];

export class TronGridBadRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TronGridBadRequestError';
  }
}

export const resolveTronHistoryLimiterKey = (
  tronGridApiKey: string | null,
  host: string,
): LimiterKey => {
  if (tronGridApiKey === null) {
    return LimiterKey.TRON_PUBLIC;
  }
  if (host.includes('trongrid.io')) {
    return LimiterKey.TRON_GRID;
  }
  return LimiterKey.TRON_PUBLIC;
};

export const isRetriableTronHistoryError = (error: unknown): boolean => {
  if (error instanceof TronGridBadRequestError) {
    return false;
  }

  const errorMessage: string = error instanceof Error ? error.message : String(error);
  const normalizedErrorMessage: string = errorMessage.toLowerCase();

  return (
    normalizedErrorMessage.includes('429') ||
    normalizedErrorMessage.includes('http 5') ||
    normalizedErrorMessage.includes('timeout') ||
    normalizedErrorMessage.includes('aborted')
  );
};
