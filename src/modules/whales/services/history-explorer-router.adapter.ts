import { Injectable } from '@nestjs/common';

import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import { SolanaRpcHistoryAdapter } from '../../chains/solana/solana-rpc-history.adapter';
import { EtherscanHistoryAdapter } from '../../integrations/etherscan/etherscan-history.adapter';
import { TronGridHistoryAdapter } from '../../integrations/trongrid/tron-grid-history.adapter';
import type { IHistoryPageDto } from '../entities/history-item.dto';
import type { IHistoryRequestDto } from '../entities/history-request.dto';

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
