import type {
  HistoryAssetStandard,
  HistoryFlowType,
  HistoryTxType,
} from './history-card.interfaces';
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
  readonly txType: HistoryTxType;
  readonly flowType: HistoryFlowType;
  readonly flowLabel: string;
  readonly assetStandard: HistoryAssetStandard;
  readonly dex: string | null;
  readonly pair: string | null;
  readonly isError: boolean;
  readonly counterpartyAddress: string | null;
  readonly contractAddress: string | null;
}
