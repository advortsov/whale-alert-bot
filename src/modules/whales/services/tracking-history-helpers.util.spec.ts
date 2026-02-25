import { describe, expect, it, vi } from 'vitest';

import { enrichWalletHistoryItems } from './tracking-history-helpers.util';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import {
  HistoricalPriceSource,
  type ITokenHistoricalPricingPort,
} from '../../../common/interfaces/token-pricing/token-pricing.interfaces';
import {
  HistoryAssetStandard,
  HistoryFlowType,
  HistoryTxType,
} from '../entities/history-card.interfaces';
import { HistoryDirection, HistoryItemType } from '../entities/history-item.dto';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

const buildItem = (index: number): IWalletHistoryListItem => {
  return {
    txHash: `tx-${String(index)}`,
    occurredAt: new Date(1_770_000_000_000 + index * 86_400_000).toISOString(),
    eventType: HistoryItemType.TRANSFER,
    direction: HistoryDirection.IN,
    amountText: `${String(index + 1)} ETH`,
    txUrl: `https://etherscan.io/tx/tx-${String(index)}`,
    assetSymbol: 'ETH',
    chainKey: ChainKey.ETHEREUM_MAINNET,
    txType: HistoryTxType.TRANSFER,
    flowType: HistoryFlowType.P2P,
    flowLabel: 'P2P',
    assetStandard: HistoryAssetStandard.NATIVE,
    dex: null,
    pair: null,
    isError: false,
    counterpartyAddress: '0x0000000000000000000000000000000000000001',
    contractAddress: null,
    usdPrice: null,
    usdAmount: null,
    usdUnavailable: true,
    swapFromSymbol: null,
    swapFromAmountText: null,
    swapToSymbol: null,
    swapToAmountText: null,
  };
};

describe('enrichWalletHistoryItems', (): void => {
  it('limits historical pricing lookups per page and marks overflow as unavailable', async (): Promise<void> => {
    const tokenHistoricalPricingPort: ITokenHistoricalPricingPort = {
      getUsdQuoteAt: vi.fn().mockResolvedValue({
        chainKey: ChainKey.ETHEREUM_MAINNET,
        tokenAddress: null,
        tokenSymbol: 'ETH',
        usdPrice: 2,
        source: HistoricalPriceSource.RANGE,
        resolvedAtSec: 1_770_000_000,
        stale: false,
      }),
    };

    const items: readonly IWalletHistoryListItem[] = [
      buildItem(0),
      buildItem(1),
      buildItem(2),
      buildItem(3),
      buildItem(4),
    ];

    const result: readonly IWalletHistoryListItem[] = await enrichWalletHistoryItems(
      items,
      tokenHistoricalPricingPort,
    );

    expect(tokenHistoricalPricingPort.getUsdQuoteAt).toHaveBeenCalledTimes(3);
    expect(result[0]?.usdAmount).toBe(2);
    expect(result[1]?.usdAmount).toBe(4);
    expect(result[2]?.usdAmount).toBe(6);
    expect(result[3]?.usdUnavailable).toBe(true);
    expect(result[4]?.usdUnavailable).toBe(true);
  });

  it('returns unavailable usd when pricing port throws', async (): Promise<void> => {
    const tokenHistoricalPricingPort: ITokenHistoricalPricingPort = {
      getUsdQuoteAt: vi.fn().mockRejectedValue(new Error('coingecko failed')),
    };

    const items: readonly IWalletHistoryListItem[] = [buildItem(0)];
    const result: readonly IWalletHistoryListItem[] = await enrichWalletHistoryItems(
      items,
      tokenHistoricalPricingPort,
    );

    expect(result[0]?.usdUnavailable).toBe(true);
    expect(result[0]?.usdPrice).toBeNull();
    expect(result[0]?.usdAmount).toBeNull();
  });
});
