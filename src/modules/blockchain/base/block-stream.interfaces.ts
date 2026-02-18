export interface ITransactionEnvelope {
  readonly hash: string;
  readonly from: string;
  readonly to: string | null;
  readonly blockTimestampSec: number | null;
}

export interface IBlockEnvelope {
  readonly number: number;
  readonly timestampSec: number | null;
  readonly transactions: readonly ITransactionEnvelope[];
}

export interface IReceiptLogEnvelope {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly logIndex: number;
}

export interface IReceiptEnvelope {
  readonly txHash: string;
  readonly logs: readonly IReceiptLogEnvelope[];
}
