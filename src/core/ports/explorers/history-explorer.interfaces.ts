import type { HistoryPageDto } from '../../../features/tracking/dto/history-item.dto';
import type { HistoryRequestDto } from '../../../features/tracking/dto/history-request.dto';

export interface IHistoryExplorerAdapter {
  loadRecentTransactions(request: HistoryRequestDto): Promise<HistoryPageDto>;
}
