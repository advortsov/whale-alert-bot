export enum ChainId {
  ETHEREUM_MAINNET = 1,
}

export enum ClassifiedEventType {
  TRANSFER = 'TRANSFER',
  SWAP = 'SWAP',
  UNKNOWN = 'UNKNOWN',
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
  readonly contractAddress: string | null;
  readonly tokenAmountRaw: string | null;
  readonly dex: string | null;
  readonly pair: string | null;
};
