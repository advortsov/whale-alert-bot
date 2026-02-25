import { Injectable } from '@nestjs/common';

import { CexAddressBookService } from './cex-address-book.service';
import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { WalletEventHistoryView } from '../../../database/repositories/wallet-events.repository.interfaces';
import {
  HistoryAssetStandard,
  HistoryFlowType,
  HistoryTxType,
} from '../entities/history-card.interfaces';
import { HistoryDirection, type IHistoryItemDto } from '../entities/history-item.dto';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

interface IHistoryCardTraits {
  readonly txType: HistoryTxType;
  readonly flowType: HistoryFlowType;
  readonly flowLabel: string;
  readonly assetStandard: HistoryAssetStandard;
  readonly dex: string | null;
  readonly pair: string | null;
  readonly isError: boolean;
  readonly counterpartyAddress: string | null;
  readonly contractAddress: string | null;
}

interface IFlowTypeContext {
  readonly txType: HistoryTxType;
  readonly dex: string | null;
  readonly cexTag: string | null;
  readonly hasContract: boolean;
  readonly counterpartyAddress: string | null;
}

@Injectable()
export class HistoryCardClassifierService {
  public constructor(private readonly cexAddressBookService: CexAddressBookService) {}

  public classifyWalletEvent(
    chainKey: ChainKey,
    event: WalletEventHistoryView,
  ): IHistoryCardTraits {
    const txType: HistoryTxType = this.resolveTxType(event.eventType);
    const counterpartyAddress: string | null = event.counterpartyAddress;
    const dex: string | null = event.dex;
    const cexTag: string | null = this.resolveCexTag(chainKey, counterpartyAddress);
    const flowType: HistoryFlowType = this.resolveFlowType({
      txType,
      dex,
      cexTag,
      hasContract: event.contractAddress !== null || event.tokenAddress !== null,
      counterpartyAddress,
    });

    return {
      txType,
      flowType,
      flowLabel: this.resolveFlowLabel(flowType, dex, cexTag),
      assetStandard: this.resolveAssetStandard(event.assetStandard, chainKey, event.tokenSymbol),
      dex,
      pair: event.pair,
      isError: false,
      counterpartyAddress,
      contractAddress: event.contractAddress ?? event.tokenAddress,
    };
  }

  public classifyExplorerItem(chainKey: ChainKey, item: IHistoryItemDto): IHistoryCardTraits {
    const txType: HistoryTxType = this.resolveTxType(item.eventType);
    const counterpartyAddress: string | null = this.resolveCounterpartyByDirection(item);
    const cexTag: string | null = this.resolveCexTag(chainKey, counterpartyAddress);
    const flowType: HistoryFlowType = this.resolveFlowType({
      txType,
      dex: null,
      cexTag,
      hasContract: txType === HistoryTxType.CONTRACT,
      counterpartyAddress,
    });

    return {
      txType,
      flowType,
      flowLabel: this.resolveFlowLabel(flowType, null, cexTag),
      assetStandard: this.resolveAssetStandard(null, chainKey, item.assetSymbol),
      dex: null,
      pair: null,
      isError: item.isError,
      counterpartyAddress,
      contractAddress: null,
    };
  }

  public mergeHistoryItem(
    base: IWalletHistoryListItem,
    traits: IHistoryCardTraits,
  ): IWalletHistoryListItem {
    return {
      ...base,
      txType: traits.txType,
      flowType: traits.flowType,
      flowLabel: traits.flowLabel,
      assetStandard: traits.assetStandard,
      dex: traits.dex,
      pair: traits.pair,
      isError: traits.isError,
      counterpartyAddress: traits.counterpartyAddress,
      contractAddress: traits.contractAddress,
    };
  }

  private resolveTxType(eventType: string): HistoryTxType {
    const normalizedType: string = eventType.trim().toUpperCase();

    if (normalizedType === 'SWAP') {
      return HistoryTxType.SWAP;
    }

    if (normalizedType === 'TRANSFER') {
      return HistoryTxType.TRANSFER;
    }

    return HistoryTxType.CONTRACT;
  }

  private resolveFlowType(context: IFlowTypeContext): HistoryFlowType {
    if (context.dex !== null) {
      return HistoryFlowType.DEX;
    }

    if (context.cexTag !== null) {
      return HistoryFlowType.CEX;
    }

    if (context.hasContract || context.txType === HistoryTxType.CONTRACT) {
      return HistoryFlowType.CONTRACT;
    }

    if (context.txType === HistoryTxType.TRANSFER && context.counterpartyAddress !== null) {
      return HistoryFlowType.P2P;
    }

    return HistoryFlowType.UNKNOWN;
  }

  private resolveFlowLabel(
    flowType: HistoryFlowType,
    dex: string | null,
    cexTag: string | null,
  ): string {
    if (flowType === HistoryFlowType.DEX && dex !== null) {
      return `DEX:${dex}`;
    }

    if (flowType === HistoryFlowType.CEX && cexTag !== null) {
      return `CEX:${cexTag}`;
    }

    return flowType;
  }

  private resolveAssetStandard(
    rawAssetStandard: string | null,
    chainKey: ChainKey,
    assetSymbol: string | null,
  ): HistoryAssetStandard {
    const normalizedValue: string = (rawAssetStandard ?? '').trim().toUpperCase();

    if (normalizedValue === 'NATIVE') {
      return HistoryAssetStandard.NATIVE;
    }

    if (normalizedValue === 'ERC20') {
      return HistoryAssetStandard.ERC20;
    }

    if (normalizedValue === 'SPL') {
      return HistoryAssetStandard.SPL;
    }

    if (normalizedValue === 'TRC20') {
      return HistoryAssetStandard.TRC20;
    }

    if (normalizedValue === 'TRC10') {
      return HistoryAssetStandard.TRC10;
    }

    return this.resolveAssetStandardByChain(chainKey, assetSymbol);
  }

  private resolveAssetStandardByChain(
    chainKey: ChainKey,
    assetSymbol: string | null,
  ): HistoryAssetStandard {
    const normalizedSymbol: string = (assetSymbol ?? '').trim().toUpperCase();

    switch (chainKey) {
      case ChainKey.ETHEREUM_MAINNET:
        return normalizedSymbol === 'ETH'
          ? HistoryAssetStandard.NATIVE
          : HistoryAssetStandard.ERC20;
      case ChainKey.SOLANA_MAINNET:
        return normalizedSymbol === 'SOL' ? HistoryAssetStandard.NATIVE : HistoryAssetStandard.SPL;
      case ChainKey.TRON_MAINNET:
        return normalizedSymbol === 'TRX'
          ? HistoryAssetStandard.NATIVE
          : HistoryAssetStandard.TRC20;
      default:
        return HistoryAssetStandard.UNKNOWN;
    }
  }

  private resolveCexTag(chainKey: ChainKey, counterpartyAddress: string | null): string | null {
    if (chainKey !== ChainKey.ETHEREUM_MAINNET) {
      return null;
    }

    return this.cexAddressBookService.resolveTag(chainKey, counterpartyAddress);
  }

  private resolveCounterpartyByDirection(item: IHistoryItemDto): string | null {
    if (item.direction === HistoryDirection.IN) {
      return item.from;
    }

    if (item.direction === HistoryDirection.OUT) {
      return item.to;
    }

    return null;
  }
}
