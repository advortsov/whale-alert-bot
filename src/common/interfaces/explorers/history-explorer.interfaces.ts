import type { IHistoryPageDto } from '../../../modules/whales/entities/history-item.dto';
import type { IHistoryRequestDto } from '../../../modules/whales/entities/history-request.dto';

export interface IHistoryExplorerAdapter {
  loadRecentTransactions(request: IHistoryRequestDto): Promise<IHistoryPageDto>;
}
