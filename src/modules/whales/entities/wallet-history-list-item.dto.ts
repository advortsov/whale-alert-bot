import type { ChainKey } from '../../../common/interfaces/chain-key.interfaces';

export interface IWalletHistoryListItem {
  readonly txHash: string;
  readonly occurredAt: string;
  readonly eventType: string;
  readonly direction: string;
  readonly amountText: string;
  readonly txUrl: string;
  readonly assetSymbol: string | null;
  readonly chainKey: ChainKey;
}
