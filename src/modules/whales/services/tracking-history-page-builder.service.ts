import { Inject, Injectable, Logger } from '@nestjs/common';

import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import type {
  IBuildFirstHistoryPageContext,
  IBuildOffsetHistoryPageContext,
  IBuildOffsetHistoryPageFromExplorerContext,
  ITrackingHistoryPageBuilder,
} from './tracking-history-page-builder.interfaces';
import { TrackingHistoryPageService } from './tracking-history-page.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { HISTORY_EXPLORER_ADAPTER } from '../../../common/interfaces/explorers/explorer-port.tokens';
import type { IHistoryExplorerAdapter } from '../../../common/interfaces/explorers/history-explorer.interfaces';
import type { IHistoryPageDto } from '../entities/history-item.dto';
import type { HistoryPageResult } from '../entities/history-page.interfaces';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

@Injectable()
export class TrackingHistoryPageBuilderService implements ITrackingHistoryPageBuilder {
  private readonly logger: Logger = new Logger(TrackingHistoryPageBuilderService.name);

  public constructor(
    @Inject(HISTORY_EXPLORER_ADAPTER)
    private readonly historyExplorerAdapter: IHistoryExplorerAdapter,
    private readonly trackingHistoryPageService: TrackingHistoryPageService,
    private readonly historyFormatter: TrackingHistoryFormatterService,
  ) {}

  public async buildFirstHistoryPage(
    context: IBuildFirstHistoryPageContext,
  ): Promise<HistoryPageResult> {
    const localItems: readonly IWalletHistoryListItem[] =
      this.trackingHistoryPageService.mapWalletEventsToListItems(
        context.localHistoryPage.pageEvents,
        context.target.chainKey,
      );

    if (localItems.length > 0 && context.target.chainKey === ChainKey.ETHEREUM_MAINNET) {
      return this.toHistoryPageResult({
        message: context.message,
        resolvedAddress: context.target.address,
        walletId: context.target.walletId,
        limit: context.historyParams.limit,
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        hasNextPage: context.localHistoryPage.hasNextPage,
        items: localItems,
        nextOffset: context.localHistoryPage.nextOffset,
      });
    }

    let explorerPage: IHistoryPageDto = {
      items: [],
      nextOffset: null,
    };

    try {
      explorerPage = await this.historyExplorerAdapter.loadRecentTransactions({
        chainKey: context.target.chainKey,
        address: context.target.address,
        limit: context.historyParams.limit,
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        minAmountUsd: null,
      });
    } catch (error: unknown) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `history_page_items_fallback_failed address=${context.target.address} chain=${context.target.chainKey} reason=${errorMessage}`,
      );
    }

    const explorerItems: readonly IWalletHistoryListItem[] =
      this.trackingHistoryPageService.mapExplorerItemsToListItems(
        explorerPage.items,
        context.target.chainKey,
      );

    if (explorerItems.length === 0 && localItems.length > 0) {
      return this.toHistoryPageResult({
        message: context.message,
        resolvedAddress: context.target.address,
        walletId: context.target.walletId,
        limit: context.historyParams.limit,
        offset: 0,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        hasNextPage: context.localHistoryPage.hasNextPage,
        items: localItems,
        nextOffset: context.localHistoryPage.nextOffset,
      });
    }

    return this.toHistoryPageResult({
      message: context.message,
      resolvedAddress: context.target.address,
      walletId: context.target.walletId,
      limit: context.historyParams.limit,
      offset: 0,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      hasNextPage: explorerPage.nextOffset !== null,
      items: explorerItems,
      nextOffset: explorerPage.nextOffset,
    });
  }

  public buildOffsetHistoryPage(context: IBuildOffsetHistoryPageContext): HistoryPageResult {
    const message: string = this.historyFormatter.formatWalletEventsHistoryMessage(
      context.target.address,
      context.localHistoryPage.pageEvents,
      {
        offset: context.historyParams.offset,
        kind: context.historyParams.kind,
        direction: context.historyParams.direction,
        chainKey: context.target.chainKey,
      },
    );
    const items: readonly IWalletHistoryListItem[] =
      this.trackingHistoryPageService.mapWalletEventsToListItems(
        context.localHistoryPage.pageEvents,
        context.target.chainKey,
      );

    return this.toHistoryPageResult({
      message,
      resolvedAddress: context.target.address,
      walletId: context.target.walletId,
      limit: context.historyParams.limit,
      offset: context.historyParams.offset,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      hasNextPage: context.localHistoryPage.hasNextPage,
      items,
      nextOffset: context.localHistoryPage.nextOffset,
    });
  }

  public async buildOffsetHistoryPageFromExplorer(
    context: IBuildOffsetHistoryPageFromExplorerContext,
  ): Promise<HistoryPageResult> {
    const explorerPage: IHistoryPageDto = await this.historyExplorerAdapter.loadRecentTransactions({
      chainKey: context.target.chainKey,
      address: context.target.address,
      limit: context.historyParams.limit,
      offset: context.historyParams.offset,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      minAmountUsd: null,
    });
    const message: string = this.historyFormatter.formatHistoryMessage(
      context.target.address,
      explorerPage.items,
    );
    const items: readonly IWalletHistoryListItem[] =
      this.trackingHistoryPageService.mapExplorerItemsToListItems(
        explorerPage.items,
        context.target.chainKey,
      );

    return this.toHistoryPageResult({
      message,
      resolvedAddress: context.target.address,
      walletId: context.target.walletId,
      limit: context.historyParams.limit,
      offset: context.historyParams.offset,
      kind: context.historyParams.kind,
      direction: context.historyParams.direction,
      hasNextPage: explorerPage.nextOffset !== null,
      items,
      nextOffset: explorerPage.nextOffset,
    });
  }

  private toHistoryPageResult(result: HistoryPageResult): HistoryPageResult {
    return result;
  }
}
