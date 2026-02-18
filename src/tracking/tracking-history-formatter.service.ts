import { Injectable } from '@nestjs/common';
import { formatUnits } from 'ethers';

import { ChainKey } from '../common/interfaces/chain-key.interfaces';
import { AppConfigService } from '../config/app-config.service';
import type { WalletEventHistoryView } from '../database/repositories/wallet-events.repository.interfaces';
import type { IHistoryItemDto } from '../features/tracking/dto/history-item.dto';
import { HistoryDirectionFilter, HistoryKind } from '../features/tracking/dto/history-request.dto';

const ASSET_VALUE_PRECISION = 6;
const SHORT_HASH_PREFIX_LENGTH = 10;
const SHORT_HASH_SUFFIX_OFFSET = -8;

@Injectable()
export class TrackingHistoryFormatterService {
  public constructor(private readonly appConfigService: AppConfigService) {}

  public formatHistoryMessage(
    normalizedAddress: string,
    transactions: readonly IHistoryItemDto[],
  ): string {
    if (transactions.length === 0) {
      return `История для ${normalizedAddress} пуста.`;
    }

    const rows: string[] = transactions.map((tx, index: number): string => {
      const date: Date = new Date(tx.timestampSec * 1000);
      const formattedValue: string = this.formatAssetValue(tx.valueRaw, tx.assetDecimals);
      const statusIcon: string = tx.isError ? '🔴' : '🟢';
      const normalizedDirection: string = String(tx.direction).toUpperCase();
      const directionIcon: string = normalizedDirection === 'OUT' ? '↗️ OUT' : '↘️ IN';
      const escapedAssetSymbol: string = this.escapeHtml(tx.assetSymbol);
      const txUrl: string = tx.txLink ?? this.buildTxUrl(tx.txHash);
      const eventType: string = this.escapeHtml(tx.eventType);

      return [
        `<a href="${txUrl}">Tx #${index + 1}</a> ${statusIcon} ${directionIcon} <b>${formattedValue} ${escapedAssetSymbol}</b>`,
        `📌 <code>${eventType}</code>`,
        `🕒 <code>${this.formatTimestamp(date)}</code>`,
        `🔹 <code>${this.shortHash(tx.txHash)}</code>`,
      ].join('\n');
    });

    return [
      `📜 <b>История</b> <code>${normalizedAddress}</code>`,
      `Последние ${transactions.length} tx:`,
      ...rows,
    ].join('\n\n');
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
    const rows: string[] = events.map((event, index: number): string => {
      const txChainKey: ChainKey = this.resolveHistoryTxChainKey(
        event.chainKey,
        historyParams.chainKey,
      );
      const txUrl: string = this.buildTxUrl(event.txHash, txChainKey);
      const formattedValue: string = this.resolveEventValue(event);
      const directionLabel: string = this.resolveDirectionLabel(event.direction);
      const eventTypeLabel: string = this.escapeHtml(event.eventType);
      const contractShort: string =
        event.contractAddress !== null ? this.shortHash(event.contractAddress) : 'n/a';

      return [
        `<a href="${txUrl}">Tx #${index + 1}</a> ${directionLabel} <b>${this.escapeHtml(formattedValue)}</b>`,
        `📌 <code>${eventTypeLabel}</code> • <code>${contractShort}</code>`,
        `🕒 <code>${this.formatTimestamp(event.occurredAt)}</code>`,
      ].join('\n');
    });

    const startIndex: number = historyParams.offset + 1;
    const endIndex: number = historyParams.offset + events.length;

    return [
      `📜 <b>История</b> <code>${normalizedAddress}</code>`,
      `Фильтр: kind=<code>${historyParams.kind}</code>, direction=<code>${historyParams.direction}</code>`,
      `Локальные события ${startIndex}-${endIndex}:`,
      ...rows,
    ].join('\n\n');
  }

  public formatWalletCardRecentEvents(
    events: readonly WalletEventHistoryView[],
  ): readonly string[] {
    if (events.length === 0) {
      return ['- пока нет локальных событий'];
    }

    return events.map((event, index: number): string => {
      const txHashShort: string = this.shortHash(event.txHash);
      const directionLabel: string = this.resolveDirectionLabel(event.direction);
      const eventValue: string = this.resolveEventValue(event);
      const eventTimestamp: string = this.formatTimestamp(event.occurredAt);

      return `${index + 1}. ${directionLabel} ${event.eventType} • ${eventValue} • ${eventTimestamp} • ${txHashShort}`;
    });
  }

  public buildStaleMessage(cachedHistoryMessage: string): string {
    return [
      '⚠️ Показал кешированную историю (данные могут быть неактуальны).',
      cachedHistoryMessage,
    ].join('\n\n');
  }

  public formatTimestamp(date: Date): string {
    return date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  }

  private resolveDirectionLabel(direction: string): string {
    if (direction === 'OUT') {
      return '↗️ OUT';
    }

    if (direction === 'IN') {
      return '↘️ IN';
    }

    return '↔️ UNKNOWN';
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

  private shortHash(txHash: string): string {
    const prefix: string = txHash.slice(0, SHORT_HASH_PREFIX_LENGTH);
    const suffix: string = txHash.slice(SHORT_HASH_SUFFIX_OFFSET);
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
