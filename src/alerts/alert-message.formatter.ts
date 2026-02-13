import { Injectable } from '@nestjs/common';

import type { IAlertMessageContext } from './alert.interfaces';
import { ClassifiedEventType, EventDirection, type ClassifiedEvent } from '../chain/chain.types';
import { AppConfigService } from '../config/app-config.service';

const SHORT_HASH_PREFIX_LENGTH = 10;
const SHORT_HASH_SUFFIX_OFFSET = -8;

@Injectable()
export class AlertMessageFormatter {
  public constructor(private readonly appConfigService: AppConfigService) {}

  public format(event: ClassifiedEvent, context?: IAlertMessageContext): string {
    const directionLabel: string = this.formatDirection(event.direction);
    const valueLabel: string = this.formatValue(event.valueFormatted, event.tokenSymbol);
    const tokenLabel: string = event.tokenSymbol ?? 'n/a';
    const usdLine: string | null = this.formatUsdLine(context);
    const txShort: string = this.shortHash(event.txHash);
    const headerLabel: string =
      event.eventType === ClassifiedEventType.SWAP ? '🐋 SWAP' : '🐋 TRANSFER';

    if (event.eventType === ClassifiedEventType.TRANSFER) {
      const rows: string[] = [
        `${headerLabel} • ${directionLabel}`,
        `Адрес: ${event.trackedAddress}`,
        `Токен: ${tokenLabel}`,
        `Сумма: ${valueLabel}`,
        `Контракт: ${event.tokenAddress ?? event.contractAddress ?? 'n/a'}`,
        `Tx: ${txShort}`,
      ];

      if (usdLine !== null) {
        rows.push(usdLine);
      }

      return rows.join('\n');
    }

    if (event.eventType === ClassifiedEventType.SWAP) {
      const rows: string[] = [
        `${headerLabel} • ${directionLabel}`,
        `Адрес: ${event.trackedAddress}`,
        `DEX: ${event.dex ?? 'Unknown'}`,
        `Пара: ${event.pair ?? 'n/a'}`,
        `Токен: ${tokenLabel}`,
        `Сумма: ${valueLabel}`,
        `Контракт: ${event.tokenAddress ?? event.contractAddress ?? 'n/a'}`,
        `Tx: ${txShort}`,
      ];

      if (usdLine !== null) {
        rows.push(usdLine);
      }

      return rows.join('\n');
    }

    const fallbackRows: string[] = ['Событие не классифицировано.', `Tx: ${txShort}`];

    if (usdLine !== null) {
      fallbackRows.push(usdLine);
    }

    return fallbackRows.join('\n');
  }

  private formatDirection(direction: EventDirection): string {
    if (direction === EventDirection.IN) {
      return 'IN';
    }

    if (direction === EventDirection.OUT) {
      return 'OUT';
    }

    return 'UNKNOWN';
  }

  private formatValue(valueFormatted: string | null, tokenSymbol: string | null): string {
    if (!valueFormatted) {
      return 'n/a';
    }

    const symbol: string = tokenSymbol ?? 'TOKEN';
    return `${valueFormatted} ${symbol}`;
  }

  private formatUsdLine(context: IAlertMessageContext | undefined): string | null {
    if (!context) {
      return null;
    }

    if (context.usdAmount !== null && context.usdAmount > 0) {
      return `USD: ~$${context.usdAmount.toFixed(2)}`;
    }

    if (context.usdUnavailable) {
      return '⚠️ USD unavailable';
    }

    return null;
  }

  private shortHash(txHash: string): string {
    const prefix: string = txHash.slice(0, SHORT_HASH_PREFIX_LENGTH);
    const suffix: string = txHash.slice(SHORT_HASH_SUFFIX_OFFSET);
    return `${prefix}...${suffix}`;
  }
}
