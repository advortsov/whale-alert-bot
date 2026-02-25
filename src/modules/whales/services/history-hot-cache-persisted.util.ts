import { isZeroWalletEventHistory } from './history-value.util';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { WalletEventHistoryView } from '../../../database/repositories/wallet-events.repository.interfaces';
import {
  HistoryDirection,
  HistoryItemType,
  type IHistoryItemDto,
} from '../entities/history-item.dto';

const DEFAULT_TOKEN_DECIMALS = 18;
const HISTORY_DIRECTION_IN_LITERAL = 'IN';
const HISTORY_DIRECTION_OUT_LITERAL = 'OUT';

export interface IHistoryHotCacheTxBaseUrls {
  readonly etherscanTxBaseUrl: string;
  readonly tronscanTxBaseUrl: string;
}

const resolveDirection = (eventDirection: string): HistoryDirection => {
  const normalizedDirection: string = eventDirection.toUpperCase();

  if (normalizedDirection === HISTORY_DIRECTION_OUT_LITERAL) {
    return HistoryDirection.OUT;
  }

  if (normalizedDirection === HISTORY_DIRECTION_IN_LITERAL) {
    return HistoryDirection.IN;
  }

  return HistoryDirection.UNKNOWN;
};

const buildTxLink = (
  chainKey: ChainKey,
  txHash: string,
  baseUrls: IHistoryHotCacheTxBaseUrls,
): string => {
  if (chainKey === ChainKey.SOLANA_MAINNET) {
    return `https://solscan.io/tx/${txHash}`;
  }

  if (chainKey === ChainKey.TRON_MAINNET) {
    return `${baseUrls.tronscanTxBaseUrl}${txHash}`;
  }

  return `${baseUrls.etherscanTxBaseUrl}${txHash}`;
};

export const mapWalletEventsToHistoryItems = (
  chainKey: ChainKey,
  events: readonly WalletEventHistoryView[],
  baseUrls: IHistoryHotCacheTxBaseUrls,
): readonly IHistoryItemDto[] => {
  return events
    .filter((event: WalletEventHistoryView): boolean => !isZeroWalletEventHistory(event))
    .map((event: WalletEventHistoryView): IHistoryItemDto => {
      const trackedAddress: string = event.trackedAddress;
      const counterpartyAddress: string = event.counterpartyAddress ?? trackedAddress;
      const direction: HistoryDirection = resolveDirection(event.direction);
      const fromAddress: string =
        direction === HistoryDirection.OUT ? trackedAddress : counterpartyAddress;
      const toAddress: string =
        direction === HistoryDirection.OUT ? counterpartyAddress : trackedAddress;

      return {
        txHash: event.txHash,
        timestampSec: Math.floor(event.occurredAt.getTime() / 1000),
        from: fromAddress,
        to: toAddress,
        valueRaw: event.tokenAmountRaw ?? '0',
        isError: false,
        assetSymbol: event.tokenSymbol ?? 'TOKEN',
        assetDecimals: event.tokenDecimals ?? DEFAULT_TOKEN_DECIMALS,
        eventType: HistoryItemType.TRANSFER,
        direction,
        txLink: buildTxLink(chainKey, event.txHash, baseUrls),
      };
    });
};
