export interface TransactionEnvelope {
  readonly hash: string;
  readonly from: string;
  readonly to: string | null;
  readonly blockTimestampSec: number | null;
}

export interface BlockEnvelope {
  readonly number: number;
  readonly timestampSec: number | null;
  readonly transactions: readonly TransactionEnvelope[];
}

export interface ReceiptLogEnvelope {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly logIndex: number;
}

export interface ReceiptEnvelope {
  readonly txHash: string;
  readonly logs: readonly ReceiptLogEnvelope[];
}
