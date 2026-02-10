export interface SolanaSignatureInfo {
  readonly signature: string;
  readonly blockTime: number | null;
  readonly err: unknown;
}

export interface SolanaTransactionMessage {
  readonly accountKeys?: readonly (string | { readonly pubkey?: string })[];
}

export interface SolanaTransactionData {
  readonly message?: SolanaTransactionMessage;
}

export interface SolanaTransactionMeta {
  readonly preBalances?: readonly number[];
  readonly postBalances?: readonly number[];
  readonly err?: unknown;
  readonly logMessages?: readonly string[] | null;
}

export interface SolanaTransactionValue {
  readonly blockTime?: number | null;
  readonly transaction?: SolanaTransactionData;
  readonly meta?: SolanaTransactionMeta | null;
}
