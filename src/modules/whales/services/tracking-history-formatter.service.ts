import { Injectable } from '@nestjs/common';
import { formatUnits } from 'ethers';

import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import { AppConfigService } from '../../../config/app-config.service';
import type { WalletEventHistoryView } from '../../../database/repositories/wallet-events.repository.interfaces';
import {
  HistoryAssetStandard,
  HistoryFlowType,
  HistoryTxType,
} from '../entities/history-card.interfaces';
import type { IHistoryItemDto } from '../entities/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../entities/history-request.dto';
import type { IWalletHistoryListItem } from '../entities/wallet-history-list-item.dto';

const ASSET_VALUE_PRECISION = 6;
const SHORT_HASH_PREFIX_LENGTH = 10;
const SHORT_HASH_SUFFIX_OFFSET = -8;

interface IHistoryMessageMeta {
  readonly offset: number;
  readonly kind: HistoryKind | null;
  readonly direction: HistoryDirectionFilter | null;
}

@Injectable()
export class TrackingHistoryFormatterService {
  public constructor(private readonly appConfigService: AppConfigService) {}

  public formatHistoryMessage(
    normalizedAddress: string,
    transactions: readonly IHistoryItemDto[],
  ): string {
    const items: readonly IWalletHistoryListItem[] = transactions.map(
      (transaction: IHistoryItemDto): IWalletHistoryListItem => {
        const direction: string = this.resolveDirectionToken(transaction.direction);
        const txType: HistoryTxType = this.resolveTxTypeToken(transaction.eventType);
        const flowType: HistoryFlowType =
          txType === HistoryTxType.SWAP ? HistoryFlowType.DEX : HistoryFlowType.UNKNOWN;

        return {
          txHash: transaction.txHash,
          occurredAt: new Date(transaction.timestampSec * 1000).toISOString(),
          eventType: transaction.eventType,
          direction,
          amountText: this.buildExplorerHistoryAmountText(transaction),
          txUrl: transaction.txLink ?? this.buildTxUrl(transaction.txHash),
          assetSymbol: transaction.assetSymbol,
          chainKey: ChainKey.ETHEREUM_MAINNET,
          txType,
          flowType,
          flowLabel: flowType,
          assetStandard: this.resolveAssetStandardFromSymbol(transaction.assetSymbol),
          dex: null,
          pair: null,
          isError: transaction.isError,
          counterpartyAddress: direction === 'IN' ? transaction.from : transaction.to,
          contractAddress: null,
        };
      },
    );

    return this.formatHistoryListMessage(normalizedAddress, items, {
      offset: 0,
      kind: null,
      direction: null,
    });
  }

  public formatWalletEventsHistoryMessage(
    normalizedAddress: string,
    events: readonly WalletEventHistoryView[],
    historyParams: {
      readonly offset: number;
      readonly kind: HistoryKind;
      readonly direction: HistoryDirectionFilter;
      readonly chainKey: ChainKey;
    },
  ): string {
    const items: readonly IWalletHistoryListItem[] = events.map(
      (event: WalletEventHistoryView): IWalletHistoryListItem => {
        const chainKey: ChainKey = this.resolveHistoryTxChainKey(
          event.chainKey,
          historyParams.chainKey,
        );
        const txType: HistoryTxType = this.resolveTxTypeToken(event.eventType);
        const flowLabel: string = this.resolveEventFlowLabel(event, txType);

        return {
          txHash: event.txHash,
          occurredAt: event.occurredAt.toISOString(),
          eventType: event.eventType,
          direction: this.resolveDirectionToken(event.direction),
          amountText: this.buildWalletEventAmountText(event),
          txUrl: this.buildTxUrl(event.txHash, chainKey),
          assetSymbol: event.tokenSymbol,
          chainKey,
          txType,
          flowType: this.resolveFlowTypeFromLabel(flowLabel),
          flowLabel,
          assetStandard: this.resolveAssetStandardToken(event.assetStandard, event.tokenSymbol),
          dex: event.dex,
          pair: event.pair,
          isError: false,
          counterpartyAddress: event.counterpartyAddress,
          contractAddress: event.contractAddress ?? event.tokenAddress,
        };
      },
    );

    return this.formatHistoryListMessage(normalizedAddress, items, {
      offset: historyParams.offset,
      kind: historyParams.kind,
      direction: historyParams.direction,
    });
  }

  public formatHistoryListMessage(
    normalizedAddress: string,
    items: readonly IWalletHistoryListItem[],
    meta: IHistoryMessageMeta,
  ): string {
    if (items.length === 0) {
      return `История для ${normalizedAddress} пуста.`;
    }

    const rows: readonly string[] = items.map(
      (item: IWalletHistoryListItem, index: number): string => {
        const txUrl: string = item.txUrl;
        const statusToken: string = item.isError ? '[ERROR]' : '[OK]';
        const badges: string = [
          `[${item.txType}]`,
          `[${this.resolveDirectionToken(item.direction)}]`,
          `[${this.escapeHtml(item.flowLabel)}]`,
          `[${item.assetStandard}]`,
          statusToken,
        ]
          .map((token: string): string => `<code>${this.escapeHtml(token)}</code>`)
          .join(' ');

        const counterpartyLine: string =
          typeof item.counterpartyAddress === 'string' && item.counterpartyAddress.trim().length > 0
            ? `👤 <code>${this.shortHash(item.counterpartyAddress)}</code>`
            : '👤 <code>n/a</code>';
        const contractLine: string =
          typeof item.contractAddress === 'string' && item.contractAddress.trim().length > 0
            ? `🧩 <code>${this.shortHash(item.contractAddress)}</code>`
            : '🧩 <code>n/a</code>';

        return [
          `<a href="${txUrl}">Tx #${meta.offset + index + 1}</a> <b>${this.escapeHtml(item.amountText)}</b>`,
          `🏷 ${badges}`,
          `🕒 <code>${this.formatTimestamp(new Date(item.occurredAt))}</code>`,
          `🔹 <code>${this.shortHash(item.txHash)}</code> • ${counterpartyLine} • ${contractLine}`,
        ].join('\n');
      },
    );

    const filterRow: string =
      meta.kind === null || meta.direction === null
        ? `Последние ${items.length} tx:`
        : `Фильтр: kind=<code>${meta.kind}</code>, direction=<code>${meta.direction}</code>`;

    return [`📜 <b>История</b> <code>${normalizedAddress}</code>`, filterRow, ...rows].join('\n\n');
  }

  public formatWalletCardRecentEvents(
    events: readonly WalletEventHistoryView[],
  ): readonly string[] {
    if (events.length === 0) {
      return ['- пока нет локальных событий'];
    }

    return events.map((event: WalletEventHistoryView, index: number): string => {
      const txHashShort: string = this.shortHash(event.txHash);
      const directionLabel: string = this.resolveDirectionToken(event.direction);
      const eventValue: string = this.resolveEventValue(event);
      const eventTimestamp: string = this.formatTimestamp(event.occurredAt);
      const flowLabel: string = this.resolveEventFlowLabel(
        event,
        this.resolveTxTypeToken(event.eventType),
      );
      const assetStandard: string = this.resolveAssetStandardToken(
        event.assetStandard,
        event.tokenSymbol,
      );

      return `${index + 1}. [${event.eventType}] [${directionLabel}] [${flowLabel}] [${assetStandard}] • ${eventValue} • ${eventTimestamp} • ${txHashShort}`;
    });
  }

  public buildStaleMessage(cachedHistoryMessage: string): string {
    return [
      '⚠️ Показал кешированную историю (данные могут быть неактуальны).',
      cachedHistoryMessage,
    ].join('\n\n');
  }

  public buildTxUrlByChain(txHash: string, chainKey: ChainKey): string {
    return this.buildTxUrl(txHash, chainKey);
  }

  public buildWalletEventAmountText(event: WalletEventHistoryView): string {
    return this.resolveEventValue(event);
  }

  public buildExplorerHistoryAmountText(item: IHistoryItemDto): string {
    const formattedValue: string = this.formatAssetValue(item.valueRaw, item.assetDecimals);
    return `${formattedValue} ${item.assetSymbol}`;
  }

  public formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  }

  private resolveDirectionToken(direction: string): string {
    const normalizedDirection: string = direction.trim().toUpperCase();

    if (normalizedDirection === 'OUT') {
      return 'OUT';
    }

    if (normalizedDirection === 'IN') {
      return 'IN';
    }

    return 'UNKNOWN';
  }

  private resolveFlowTypeFromLabel(flowLabel: string): HistoryFlowType {
    if (flowLabel.startsWith('DEX:')) {
      return HistoryFlowType.DEX;
    }

    if (flowLabel.startsWith('CEX:')) {
      return HistoryFlowType.CEX;
    }

    if (flowLabel === 'CONTRACT') {
      return HistoryFlowType.CONTRACT;
    }

    if (flowLabel === 'P2P') {
      return HistoryFlowType.P2P;
    }

    return HistoryFlowType.UNKNOWN;
  }

  private resolveEventFlowLabel(event: WalletEventHistoryView, txType: HistoryTxType): string {
    if (event.dex !== null && event.dex.trim().length > 0) {
      return `DEX:${event.dex.trim().toLowerCase()}`;
    }

    if (
      event.contractAddress !== null ||
      event.tokenAddress !== null ||
      txType === HistoryTxType.CONTRACT
    ) {
      return HistoryFlowType.CONTRACT;
    }

    if (event.counterpartyAddress !== null && txType === HistoryTxType.TRANSFER) {
      return HistoryFlowType.P2P;
    }

    return HistoryFlowType.UNKNOWN;
  }

  private resolveAssetStandardToken(
    rawStandard: string | null,
    tokenSymbol: string | null,
  ): HistoryAssetStandard {
    const normalizedStandard: string = (rawStandard ?? '').trim().toUpperCase();

    if (normalizedStandard === 'NATIVE') {
      return HistoryAssetStandard.NATIVE;
    }

    if (normalizedStandard === 'ERC20') {
      return HistoryAssetStandard.ERC20;
    }

    if (normalizedStandard === 'SPL') {
      return HistoryAssetStandard.SPL;
    }

    if (normalizedStandard === 'TRC20') {
      return HistoryAssetStandard.TRC20;
    }

    if (normalizedStandard === 'TRC10') {
      return HistoryAssetStandard.TRC10;
    }

    return this.resolveAssetStandardFromSymbol(tokenSymbol);
  }

  private resolveAssetStandardFromSymbol(tokenSymbol: string | null): HistoryAssetStandard {
    const normalizedSymbol: string = (tokenSymbol ?? '').trim().toUpperCase();

    if (normalizedSymbol === 'ETH' || normalizedSymbol === 'SOL' || normalizedSymbol === 'TRX') {
      return HistoryAssetStandard.NATIVE;
    }

    if (normalizedSymbol.length === 0) {
      return HistoryAssetStandard.UNKNOWN;
    }

    return HistoryAssetStandard.ERC20;
  }

  private resolveTxTypeToken(eventType: string): HistoryTxType {
    const normalizedType: string = eventType.trim().toUpperCase();

    if (normalizedType === 'SWAP') {
      return HistoryTxType.SWAP;
    }

    if (normalizedType === 'TRANSFER') {
      return HistoryTxType.TRANSFER;
    }

    return HistoryTxType.CONTRACT;
  }

  private resolveEventValue(event: WalletEventHistoryView): string {
    if (event.valueFormatted !== null && event.valueFormatted.trim().length > 0) {
      const symbolFromValue: string = event.tokenSymbol ?? 'TOKEN';
      return `${event.valueFormatted} ${symbolFromValue}`;
    }

    if (event.tokenAmountRaw !== null && event.tokenDecimals !== null && event.tokenDecimals >= 0) {
      const normalizedAmount: string = this.formatAssetValue(
        event.tokenAmountRaw,
        event.tokenDecimals,
      );
      const symbolFromAmount: string = event.tokenSymbol ?? 'TOKEN';
      return `${normalizedAmount} ${symbolFromAmount}`;
    }

    if (event.tokenSymbol !== null && event.tokenSymbol.trim().length > 0) {
      return event.tokenSymbol;
    }

    return event.eventType;
  }

  private formatAssetValue(valueRaw: string, decimals: number): string {
    try {
      const formatted: string = formatUnits(BigInt(valueRaw), decimals);
      return Number.parseFloat(formatted).toFixed(ASSET_VALUE_PRECISION);
    } catch {
      return '0.000000';
    }
  }

  private buildTxUrl(txHash: string, chainKey: ChainKey = ChainKey.ETHEREUM_MAINNET): string {
    if (chainKey === ChainKey.SOLANA_MAINNET) {
      return `https://solscan.io/tx/${txHash}`;
    }

    if (chainKey === ChainKey.TRON_MAINNET) {
      return `${this.appConfigService.tronscanTxBaseUrl}${txHash}`;
    }

    return `${this.appConfigService.etherscanTxBaseUrl}${txHash}`;
  }

  private resolveHistoryTxChainKey(
    rawChainKey: string | null,
    fallbackChainKey: ChainKey,
  ): ChainKey {
    if (rawChainKey === ChainKey.ETHEREUM_MAINNET) {
      return ChainKey.ETHEREUM_MAINNET;
    }

    if (rawChainKey === ChainKey.SOLANA_MAINNET) {
      return ChainKey.SOLANA_MAINNET;
    }

    if (rawChainKey === ChainKey.TRON_MAINNET) {
      return ChainKey.TRON_MAINNET;
    }

    return fallbackChainKey;
  }

  private shortHash(value: string | null | undefined): string {
    if (typeof value !== 'string') {
      return 'n/a';
    }

    const normalizedValue: string = value.trim();

    if (normalizedValue.length === 0) {
      return 'n/a';
    }
    if (normalizedValue.length <= SHORT_HASH_PREFIX_LENGTH + Math.abs(SHORT_HASH_SUFFIX_OFFSET)) {
      return normalizedValue;
    }
    const prefix: string = normalizedValue.slice(0, SHORT_HASH_PREFIX_LENGTH);
    const suffix: string = normalizedValue.slice(SHORT_HASH_SUFFIX_OFFSET);
    return `${prefix}...${suffix}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
