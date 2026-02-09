export enum EtherscanHistoryAction {
  TX_LIST = 'txlist',
  TOKEN_TX_LIST = 'tokentx',
}

export type EtherscanNormalTransaction = {
  readonly hash: string;
  readonly timeStamp: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly isError: string;
};

export type EtherscanTokenTransaction = {
  readonly hash: string;
  readonly timeStamp: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly tokenSymbol: string;
  readonly tokenDecimal: string;
  readonly isError?: string;
};

export type EtherscanHistoryResponse = {
  readonly status: string;
  readonly message: string;
  readonly result: readonly unknown[] | string;
};

export type HistoryTransactionItem = {
  readonly hash: string;
  readonly timestampSec: number;
  readonly from: string;
  readonly to: string;
  readonly valueRaw: string;
  readonly isError: boolean;
  readonly assetSymbol: string;
  readonly assetDecimals: number;
};
