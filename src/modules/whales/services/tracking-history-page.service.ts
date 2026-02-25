import { Injectable } from '@nestjs/common';

import { HistoryCardClassifierService } from './history-card-classifier.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import type { WalletEventHistoryView } from '../../../database/repositories/wallet-events.repository.interfaces';
import type { IHistoryItemDto } from '../entities/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../entities/history-request.dto';
import type { IParsedHistoryQueryParams } from '../entities/tracking-history-request.dto';
import type {
  ILocalHistoryPageContext,
  ILocalHistoryPageData,
} from '../entities/tracking-history.interfaces';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

const LOCAL_EVENTS_BUFFER = 50;
const LOCAL_EVENTS_MAX_FETCH = 200;

@Injectable()
export class TrackingHistoryPageService {
  public constructor(
    private readonly walletEventsRepository: WalletEventsRepository,
    private readonly historyFormatter: TrackingHistoryFormatterService,
    private readonly historyCardClassifierService: HistoryCardClassifierService,
  ) {}

  public async loadLocalHistoryPage(
    context: ILocalHistoryPageContext,
  ): Promise<ILocalHistoryPageData> {
    const rawFetchLimit: number = Math.min(
      Math.max(
        context.historyParams.offset + context.historyParams.limit + LOCAL_EVENTS_BUFFER,
        context.historyParams.limit + 1,
      ),
      LOCAL_EVENTS_MAX_FETCH,
    );
    const rawEvents: readonly WalletEventHistoryView[] =
      await this.walletEventsRepository.listRecentByTrackedAddress(
        context.chainKey,
        context.normalizedAddress,
        rawFetchLimit,
        0,
      );
    const filteredEvents: readonly WalletEventHistoryView[] = this.filterLocalEvents(
      rawEvents,
      context.historyParams,
    );
    const pageStart: number = Math.max(context.historyParams.offset, 0);
    const pageEndExclusive: number = pageStart + context.historyParams.limit;
    const pageEvents: readonly WalletEventHistoryView[] = filteredEvents.slice(
      pageStart,
      pageEndExclusive,
    );
    const hasNextPage: boolean = filteredEvents.length > pageEndExclusive;
    const nextOffset: number | null = hasNextPage ? pageEndExclusive : null;

    return {
      pageEvents,
      hasNextPage,
      nextOffset,
    };
  }

  public mapWalletEventsToListItems(
    events: readonly WalletEventHistoryView[],
    fallbackChainKey: ChainKey,
  ): readonly IWalletHistoryListItem[] {
    return events.map((event: WalletEventHistoryView): IWalletHistoryListItem => {
      const chainKey: ChainKey = this.resolveChainKey(event.chainKey, fallbackChainKey);
      const assetSymbol: string | null =
        event.tokenSymbol !== null && event.tokenSymbol.trim().length > 0
          ? event.tokenSymbol
          : null;
      const cardTraits = this.historyCardClassifierService.classifyWalletEvent(chainKey, event);

      const baseItem: IWalletHistoryListItem = {
        txHash: event.txHash,
        occurredAt: event.occurredAt.toISOString(),
        eventType: event.eventType,
        direction: event.direction,
        amountText: this.historyFormatter.buildWalletEventAmountText(event),
        txUrl: this.historyFormatter.buildTxUrlByChain(event.txHash, chainKey),
        assetSymbol,
        chainKey,
        txType: cardTraits.txType,
        flowType: cardTraits.flowType,
        flowLabel: cardTraits.flowLabel,
        assetStandard: cardTraits.assetStandard,
        dex: cardTraits.dex,
        pair: cardTraits.pair,
        isError: cardTraits.isError,
        counterpartyAddress: cardTraits.counterpartyAddress,
        contractAddress: cardTraits.contractAddress,
      };

      return baseItem;
    });
  }

  public mapExplorerItemsToListItems(
    items: readonly IHistoryItemDto[],
    chainKey: ChainKey,
  ): readonly IWalletHistoryListItem[] {
    return items.map((item: IHistoryItemDto): IWalletHistoryListItem => {
      const amountText: string = this.historyFormatter.buildExplorerHistoryAmountText(item);
      const txUrl: string =
        item.txLink ?? this.historyFormatter.buildTxUrlByChain(item.txHash, chainKey);
      const cardTraits = this.historyCardClassifierService.classifyExplorerItem(chainKey, item);

      const baseItem: IWalletHistoryListItem = {
        txHash: item.txHash,
        occurredAt: new Date(item.timestampSec * 1000).toISOString(),
        eventType: item.eventType,
        direction: item.direction,
        amountText,
        txUrl,
        assetSymbol: item.assetSymbol,
        chainKey,
        txType: cardTraits.txType,
        flowType: cardTraits.flowType,
        flowLabel: cardTraits.flowLabel,
        assetStandard: cardTraits.assetStandard,
        dex: cardTraits.dex,
        pair: cardTraits.pair,
        isError: cardTraits.isError,
        counterpartyAddress: cardTraits.counterpartyAddress,
        contractAddress: cardTraits.contractAddress,
      };

      return baseItem;
    });
  }

  private filterLocalEvents(
    rawEvents: readonly WalletEventHistoryView[],
    historyParams: IParsedHistoryQueryParams,
  ): readonly WalletEventHistoryView[] {
    return rawEvents.filter((event: WalletEventHistoryView): boolean => {
      if (historyParams.direction === HistoryDirectionFilter.IN && event.direction !== 'IN') {
        return false;
      }

      if (historyParams.direction === HistoryDirectionFilter.OUT && event.direction !== 'OUT') {
        return false;
      }

      if (historyParams.kind === HistoryKind.ETH) {
        return event.tokenAddress === null || event.tokenSymbol === 'ETH';
      }

      if (historyParams.kind === HistoryKind.ERC20) {
        return event.tokenAddress !== null && event.tokenSymbol !== 'ETH';
      }

      return true;
    });
  }

  private resolveChainKey(rawChainKey: string, fallbackChainKey: ChainKey): ChainKey {
    if (rawChainKey === String(ChainKey.ETHEREUM_MAINNET)) {
      return ChainKey.ETHEREUM_MAINNET;
    }

    if (rawChainKey === String(ChainKey.SOLANA_MAINNET)) {
      return ChainKey.SOLANA_MAINNET;
    }

    if (rawChainKey === String(ChainKey.TRON_MAINNET)) {
      return ChainKey.TRON_MAINNET;
    }

    return fallbackChainKey;
  }
}
