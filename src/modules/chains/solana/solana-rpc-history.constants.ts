import type { ISolanaSignatureInfo } from './solana-rpc-history.interfaces';
import { LimiterKey } from '../../blockchain/rate-limiting/bottleneck-rate-limiter.interfaces';
import type { IHistoryItemDto } from '../../whales/entities/history-item.dto';

export const SOLSCAN_TX_BASE_URL = 'https://solscan.io/tx/';
export const SOLANA_HISTORY_REQUEST_TIMEOUT_MS = 10_000;
export const SPL_TOKEN_DECIMALS = 6;
export const SOL_NATIVE_DECIMALS = 9;
export const SOLANA_SIGNATURES_BATCH_MAX = 1_000;
export const SOLANA_SIGNATURES_BATCH_DEFAULT = 200;
export const SOLANA_SCAN_LIMIT_MAX = 400;
export const SOLANA_SCAN_LIMIT_MULTIPLIER = 5;
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
export const HISTORY_WARN_COOLDOWN_MS = 30_000;

export interface ISolanaHistoryScanState {
  readonly signatures: ISolanaSignatureInfo[];
  reachedSignaturesEnd: boolean;
  signatureCursor: number;
  scannedSignaturesCount: number;
  readonly pageItems: IHistoryItemDto[];
}

export const resolveSolanaHistoryLimiterKey = (
  endpointUrl: string,
  publicUrl: string | null,
): LimiterKey => {
  const normalizedUrl: string = endpointUrl.trim();
  if (publicUrl !== null && normalizedUrl === publicUrl.trim()) {
    return LimiterKey.SOLANA_PUBLIC;
  }
  return LimiterKey.SOLANA_HELIUS;
};

export const resolveSolanaHistoryScanLimit = (offset: number, limit: number): number => {
  const desiredScan: number = offset + limit * SOLANA_SCAN_LIMIT_MULTIPLIER;
  return Math.min(Math.max(desiredScan, limit), SOLANA_SCAN_LIMIT_MAX);
};
