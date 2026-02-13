export {
  EtherscanHistoryAction,
  type IEtherscanHistoryResponse,
  type IEtherscanNormalTransaction,
  type IEtherscanTokenTransaction,
} from '../integrations/explorers/etherscan/etherscan-history.interfaces';

export interface IHistoryTransactionItem {
  readonly hash: string;
  readonly timestampSec: number;
  readonly from: string;
  readonly to: string;
  readonly valueRaw: string;
  readonly isError: boolean;
  readonly assetSymbol: string;
  readonly assetDecimals: number;
}
