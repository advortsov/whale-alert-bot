import { type ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { HistoryDirection, type IHistoryItemDto } from '../entities/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../entities/history-request.dto';

const IDENTITY_DELIMITER = '::';
const NATIVE_SYMBOLS: readonly string[] = ['ETH', 'SOL', 'TRX'];

export const buildHistoryHotCacheKey = (chainKey: ChainKey, address: string): string => {
  return `${chainKey}:${address.toLowerCase()}`;
};

export const buildHistoryHotCacheItemIdentity = (item: IHistoryItemDto): string => {
  return [
    item.txHash,
    item.assetSymbol,
    item.direction,
    item.valueRaw,
    String(item.timestampSec),
  ].join(IDENTITY_DELIMITER);
};

export const matchesHistoryHotCacheKind = (item: IHistoryItemDto, kind: HistoryKind): boolean => {
  if (kind === HistoryKind.ALL) {
    return true;
  }

  const isNativeAsset: boolean = NATIVE_SYMBOLS.includes(item.assetSymbol.toUpperCase());

  if (kind === HistoryKind.ETH) {
    return isNativeAsset;
  }

  return !isNativeAsset;
};

export const matchesHistoryHotCacheDirection = (
  item: IHistoryItemDto,
  direction: HistoryDirectionFilter,
): boolean => {
  if (direction === HistoryDirectionFilter.ALL) {
    return true;
  }

  if (direction === HistoryDirectionFilter.IN) {
    return item.direction === HistoryDirection.IN;
  }

  return item.direction === HistoryDirection.OUT;
};
