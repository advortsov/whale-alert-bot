export enum EtherscanHistoryAction {
  TX_LIST = 'txlist',
  TOKEN_TX_LIST = 'tokentx',
}

export interface IEtherscanNormalTransaction {
  readonly hash: string;
  readonly timeStamp: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly isError: string;
}

export interface IEtherscanTokenTransaction {
  readonly hash: string;
  readonly timeStamp: string;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly tokenSymbol: string;
  readonly tokenDecimal: string;
  readonly isError?: string;
}

export interface IEtherscanHistoryResponse {
  readonly status: string;
  readonly message: string;
  readonly result: readonly unknown[] | string;
}
