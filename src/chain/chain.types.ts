export enum ChainId {
  ETHEREUM_MAINNET = 1,
  SOLANA_MAINNET = 101,
  TRON_MAINNET = 111,
}

export enum ClassifiedEventType {
  TRANSFER = 'TRANSFER',
  SWAP = 'SWAP',
  UNKNOWN = 'UNKNOWN',
}

export enum EventDirection {
  IN = 'IN',
  OUT = 'OUT',
  UNKNOWN = 'UNKNOWN',
}

export enum AssetStandard {
  NATIVE = 'NATIVE',
  ERC20 = 'ERC20',
  SPL = 'SPL',
  TRC20 = 'TRC20',
  TRC10 = 'TRC10',
}

export type ObservedTransaction = {
  readonly chainId: ChainId;
  readonly txHash: string;
  readonly trackedAddress: string;
  readonly txFrom: string;
  readonly txTo: string | null;
  readonly logs: readonly {
    readonly address: string;
    readonly topics: readonly string[];
    readonly data: string;
    readonly logIndex: number;
  }[];
};

export type ClassifiedEvent = {
  readonly chainId: ChainId;
  readonly txHash: string;
  readonly logIndex: number;
  readonly trackedAddress: string;
  readonly eventType: ClassifiedEventType;
  readonly direction: EventDirection;
  readonly assetStandard: AssetStandard;
  readonly contractAddress: string | null;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly tokenDecimals: number | null;
  readonly tokenAmountRaw: string | null;
  readonly valueFormatted: string | null;
  readonly counterpartyAddress: string | null;
  readonly dex: string | null;
  readonly pair: string | null;
};
