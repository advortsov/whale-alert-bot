export enum EtherscanHistoryAction {
  TX_LIST = 'txlist',
  TOKEN_TX_LIST = 'tokentx',
}

export interface EtherscanNormalTransaction {
  readonly hash: string;
  readonly timeStamp: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly isError: string;
}

export interface EtherscanTokenTransaction {
  readonly hash: string;
  readonly timeStamp: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly tokenSymbol: string;
  readonly tokenDecimal: string;
  readonly isError?: string;
}

export interface EtherscanHistoryResponse {
  readonly status: string;
  readonly message: string;
  readonly result: readonly unknown[] | string;
}
