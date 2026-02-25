import { SOLANA_SCAN_LIMIT_MAX } from './solana-rpc-history.constants';
import type { ISolanaHistoryScanState } from './solana-rpc-history.constants';
import type { IHistoryPageDto } from '../../whales/entities/history-item.dto';

export const buildSolanaHistoryPageResult = (
  requestLimit: number,
  scanState: ISolanaHistoryScanState,
): IHistoryPageDto => {
  if (scanState.pageItems.length === 0) {
    return {
      items: [],
      nextOffset: null,
    };
  }

  const hasKnownTail: boolean = scanState.signatureCursor < scanState.signatures.length;
  const hasUnknownTail: boolean =
    scanState.pageItems.length >= requestLimit &&
    (!scanState.reachedSignaturesEnd || scanState.scannedSignaturesCount >= SOLANA_SCAN_LIMIT_MAX);
  const hasNextPage: boolean =
    scanState.pageItems.length >= requestLimit && (hasKnownTail || hasUnknownTail);

  return {
    items: scanState.pageItems,
    nextOffset: hasNextPage ? scanState.signatureCursor : null,
  };
};
