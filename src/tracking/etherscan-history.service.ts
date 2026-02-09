import { Injectable } from '@nestjs/common';

import type { HistoryTransactionItem } from './etherscan-history.interfaces';
import { ChainKey } from '../core/chains/chain-key.interfaces';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';
import { EtherscanHistoryAdapter } from '../integrations/explorers/etherscan/etherscan-history.adapter';

@Injectable()
export class EtherscanHistoryService {
  public constructor(private readonly etherscanHistoryAdapter: EtherscanHistoryAdapter) {}

  public async loadRecentTransactions(
    address: string,
    limit: number,
  ): Promise<readonly HistoryTransactionItem[]> {
    const page = await this.etherscanHistoryAdapter.loadRecentTransactions({
      chainKey: ChainKey.ETHEREUM_MAINNET,
      address,
      limit,
      offset: 0,
      kind: HistoryKind.ALL,
      direction: HistoryDirectionFilter.ALL,
    });

    return page.items.map(
      (item): HistoryTransactionItem => ({
        hash: item.txHash,
        timestampSec: item.timestampSec,
        from: item.from,
        to: item.to,
        valueRaw: item.valueRaw,
        isError: item.isError,
        assetSymbol: item.assetSymbol,
        assetDecimals: item.assetDecimals,
      }),
    );
  }
}
