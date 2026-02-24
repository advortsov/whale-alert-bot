import type { HistoryPageResult } from '../entities/history-page.interfaces';
import type { IParsedHistoryQueryParams } from '../entities/tracking-history-request.dto';
import type {
  IHistoryTargetSnapshot,
  ILocalHistoryPageData,
} from '../entities/tracking-history.interfaces';

export interface IBuildFirstHistoryPageContext {
  readonly message: string;
  readonly target: IHistoryTargetSnapshot;
  readonly historyParams: IParsedHistoryQueryParams;
  readonly localHistoryPage: ILocalHistoryPageData;
}

export interface IBuildOffsetHistoryPageContext {
  readonly target: IHistoryTargetSnapshot;
  readonly historyParams: IParsedHistoryQueryParams;
  readonly localHistoryPage: ILocalHistoryPageData;
}

export interface IBuildOffsetHistoryPageFromExplorerContext {
  readonly target: IHistoryTargetSnapshot;
  readonly historyParams: IParsedHistoryQueryParams;
}

export interface ITrackingHistoryPageBuilder {
  buildFirstHistoryPage(context: IBuildFirstHistoryPageContext): Promise<HistoryPageResult>;
  buildOffsetHistoryPage(context: IBuildOffsetHistoryPageContext): HistoryPageResult;
  buildOffsetHistoryPageFromExplorer(
    context: IBuildOffsetHistoryPageFromExplorerContext,
  ): Promise<HistoryPageResult>;
}
