export enum HistoryItemType {
  TRANSFER = 'TRANSFER',
  SWAP = 'SWAP',
  UNKNOWN = 'UNKNOWN',
}

export enum HistoryDirection {
  IN = 'IN',
  OUT = 'OUT',
  UNKNOWN = 'UNKNOWN',
}

export interface HistoryItemDto {
  readonly txHash: string;
  readonly timestampSec: number;
  readonly from: string;
  readonly to: string;
  readonly valueRaw: string;
  readonly isError: boolean;
  readonly assetSymbol: string;
  readonly assetDecimals: number;
  readonly eventType: HistoryItemType;
  readonly direction: HistoryDirection;
  readonly txLink: string | null;
}

export interface HistoryPageDto {
  readonly items: readonly HistoryItemDto[];
  readonly nextOffset: number | null;
}
