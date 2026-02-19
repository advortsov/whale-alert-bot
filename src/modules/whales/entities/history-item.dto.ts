export enum HistoryItemType {
  TRANSFER = 'TRANSFER',
}

export enum HistoryDirection {
  IN = 'IN',
  OUT = 'OUT',
  UNKNOWN = 'UNKNOWN',
}

export interface IHistoryItemDto {
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

export interface IHistoryPageDto {
  readonly items: readonly IHistoryItemDto[];
  readonly nextOffset: number | null;
}
