import type { IHistoryPageDto } from '../../../features/tracking/dto/history-item.dto';
import type { IHistoryRequestDto } from '../../../features/tracking/dto/history-request.dto';

export interface IHistoryExplorerAdapter {
  loadRecentTransactions(request: IHistoryRequestDto): Promise<IHistoryPageDto>;
}
