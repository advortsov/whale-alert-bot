export {
  EtherscanHistoryAction,
  type EtherscanHistoryResponse,
  type EtherscanNormalTransaction,
  type EtherscanTokenTransaction,
} from '../integrations/explorers/etherscan/etherscan-history.interfaces';

export interface HistoryTransactionItem {
  readonly hash: string;
  readonly timestampSec: number;
  readonly from: string;
  readonly to: string;
  readonly valueRaw: string;
  readonly isError: boolean;
  readonly assetSymbol: string;
  readonly assetDecimals: number;
}
