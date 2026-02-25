import type { ClassifiedEvent } from '../../common/interfaces/chain.types';

export type WalletEventHistoryView = {
  readonly chainId: number;
  readonly chainKey: string;
  readonly txHash: string;
  readonly logIndex: number;
  readonly trackedAddress: string;
  readonly eventType: string;
  readonly direction: string;
  readonly assetStandard: string;
  readonly contractAddress: string | null;
  readonly tokenAddress: string | null;
  readonly tokenSymbol: string | null;
  readonly tokenDecimals: number | null;
  readonly tokenAmountRaw: string | null;
  readonly valueFormatted: string | null;
  readonly counterpartyAddress: string | null;
  readonly dex: string | null;
  readonly pair: string | null;
  readonly usdPrice: number | null;
  readonly usdAmount: number | null;
  readonly usdUnavailable: boolean;
  readonly swapFromSymbol: string | null;
  readonly swapFromAmountText: string | null;
  readonly swapToSymbol: string | null;
  readonly swapToAmountText: string | null;
  readonly occurredAt: Date;
};

export type SaveWalletEventInput = {
  readonly event: ClassifiedEvent;
  readonly occurredAt: Date;
};
