export interface ISolanaSignatureInfo {
  readonly signature: string;
  readonly blockTime: number | null;
  readonly err: unknown;
}

export interface ISolanaTransactionMessage {
  readonly accountKeys?: readonly (string | { readonly pubkey?: string })[];
}

export interface ISolanaTransactionData {
  readonly message?: ISolanaTransactionMessage;
}

export interface ISolanaTransactionMeta {
  readonly preBalances?: readonly number[];
  readonly postBalances?: readonly number[];
  readonly err?: unknown;
  readonly logMessages?: readonly string[] | null;
}

export interface ISolanaTransactionValue {
  readonly blockTime?: number | null;
  readonly transaction?: ISolanaTransactionData;
  readonly meta?: ISolanaTransactionMeta | null;
}
