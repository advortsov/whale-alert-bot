import { Injectable } from '@nestjs/common';

import { EtherscanHistoryAdapter } from './etherscan/etherscan-history.adapter';
import { SolanaRpcHistoryAdapter } from './solana/solana-rpc-history.adapter';
import { TronGridHistoryAdapter } from './tron/tron-grid-history.adapter';
import { ChainKey } from '../../core/chains/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../core/ports/explorers/history-explorer.interfaces';
import type { HistoryPageDto } from '../../features/tracking/dto/history-item.dto';
import type { HistoryRequestDto } from '../../features/tracking/dto/history-request.dto';

@Injectable()
export class HistoryExplorerRouterAdapter implements IHistoryExplorerAdapter {
  public constructor(
    private readonly etherscanHistoryAdapter: EtherscanHistoryAdapter,
    private readonly solanaRpcHistoryAdapter: SolanaRpcHistoryAdapter,
    private readonly tronGridHistoryAdapter: TronGridHistoryAdapter,
  ) {}

  public async loadRecentTransactions(request: HistoryRequestDto): Promise<HistoryPageDto> {
    if (request.chainKey === ChainKey.ETHEREUM_MAINNET) {
      return this.etherscanHistoryAdapter.loadRecentTransactions(request);
    }

    if (request.chainKey === ChainKey.SOLANA_MAINNET) {
      return this.solanaRpcHistoryAdapter.loadRecentTransactions(request);
    }

    return this.tronGridHistoryAdapter.loadRecentTransactions(request);
  }
}
