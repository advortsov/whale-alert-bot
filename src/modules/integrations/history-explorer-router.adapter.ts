import { Injectable } from '@nestjs/common';

import { EtherscanHistoryAdapter } from './etherscan/etherscan-history.adapter';
import { TronGridHistoryAdapter } from './trongrid/tron-grid-history.adapter';
import { ChainKey } from '../../common/interfaces/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../common/interfaces/explorers/history-explorer.interfaces';
import type { IHistoryPageDto } from '../../features/tracking/dto/history-item.dto';
import type { IHistoryRequestDto } from '../../features/tracking/dto/history-request.dto';
import { SolanaRpcHistoryAdapter } from '../../modules/chains/solana/solana-rpc-history.adapter';

@Injectable()
export class HistoryExplorerRouterAdapter implements IHistoryExplorerAdapter {
  public constructor(
    private readonly etherscanHistoryAdapter: EtherscanHistoryAdapter,
    private readonly solanaRpcHistoryAdapter: SolanaRpcHistoryAdapter,
    private readonly tronGridHistoryAdapter: TronGridHistoryAdapter,
  ) {}

  public async loadRecentTransactions(request: IHistoryRequestDto): Promise<IHistoryPageDto> {
    if (request.chainKey === ChainKey.ETHEREUM_MAINNET) {
      return this.etherscanHistoryAdapter.loadRecentTransactions(request);
    }

    if (request.chainKey === ChainKey.SOLANA_MAINNET) {
      return this.solanaRpcHistoryAdapter.loadRecentTransactions(request);
    }

    return this.tronGridHistoryAdapter.loadRecentTransactions(request);
  }
}
