import type { ClassifiedEvent } from '../../chain/chain.types';

export type WalletEventHistoryView = {
  readonly chainId: number;
  readonly chainKey: string;
  readonly txHash: string;
  readonly logIndex: number;
  readonly trackedAddress: string;
  readonly eventType: string;
  readonly direction: string;
  readonly contractAddress: string | null;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly tokenDecimals: number | null;
  readonly tokenAmountRaw: string | null;
  readonly valueFormatted: string | null;
  readonly dex: string | null;
  readonly pair: string | null;
  readonly occurredAt: Date;
};

export type SaveWalletEventInput = {
  readonly event: ClassifiedEvent;
  readonly occurredAt: Date;
};
