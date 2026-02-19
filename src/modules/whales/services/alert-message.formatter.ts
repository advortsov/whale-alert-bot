import { Injectable } from '@nestjs/common';

import {
  ClassifiedEventType,
  EventDirection,
  type ClassifiedEvent,
} from '../../../common/interfaces/chain.types';
import { AppConfigService } from '../../../config/app-config.service';
import type { IAlertMessageContext } from '../entities/alert.interfaces';

const SHORT_HASH_PREFIX_LENGTH = 10;
const SHORT_HASH_SUFFIX_OFFSET = -8;

interface IAlertMessageBuildContext {
  readonly headerLabel: string;
  readonly directionLabel: string;
  readonly valueLabel: string;
  readonly tokenLabel: string;
  readonly txShort: string;
}

@Injectable()
export class AlertMessageFormatter {
  public constructor(private readonly appConfigService: AppConfigService) {}

  public format(event: ClassifiedEvent, context?: IAlertMessageContext): string {
    const directionLabel: string = this.formatDirection(event.direction);
    const valueLabel: string = this.formatValue(event.valueFormatted, event.tokenSymbol);
    const tokenLabel: string = event.tokenSymbol ?? 'n/a';
    const usdLine: string | null = this.formatUsdLine(context);
    const txShort: string = this.shortHash(event.txHash);
    const headerLabel: string = this.resolveHeaderLabel(event.eventType);
    const messageContext: IAlertMessageBuildContext = {
      headerLabel,
      directionLabel,
      valueLabel,
      tokenLabel,
      txShort,
    };
    const rows: string[] = this.buildRowsByEventType(event, messageContext);

    if (usdLine !== null) {
      rows.push(usdLine);
    }

    return rows.join('\n');
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

  private resolveHeaderLabel(eventType: ClassifiedEventType): string {
    if (eventType === ClassifiedEventType.SWAP) {
      return '🐋 SWAP';
    }

    if (eventType === ClassifiedEventType.TRANSFER) {
      return '🐋 TRANSFER';
    }

    return '🐋 EVENT';
  }

  private buildRowsByEventType(
    event: ClassifiedEvent,
    context: IAlertMessageBuildContext,
  ): string[] {
    if (event.eventType === ClassifiedEventType.TRANSFER) {
      return this.buildTransferRows(event, context);
    }

    if (event.eventType === ClassifiedEventType.SWAP) {
      return this.buildSwapRows(event, context);
    }

    return ['Событие не классифицировано.', `Tx: ${context.txShort}`];
  }

  private buildTransferRows(event: ClassifiedEvent, context: IAlertMessageBuildContext): string[] {
    return [
      `${context.headerLabel} • ${context.directionLabel}`,
      `Адрес: ${event.trackedAddress}`,
      `Токен: ${context.tokenLabel}`,
      `Сумма: ${context.valueLabel}`,
      `Контракт: ${event.tokenAddress ?? event.contractAddress ?? 'n/a'}`,
      `Tx: ${context.txShort}`,
    ];
  }

  private buildSwapRows(event: ClassifiedEvent, context: IAlertMessageBuildContext): string[] {
    return [
      `${context.headerLabel} • ${context.directionLabel}`,
      `Адрес: ${event.trackedAddress}`,
      `DEX: ${event.dex ?? 'Unknown'}`,
      `Пара: ${event.pair ?? 'n/a'}`,
      `Токен: ${context.tokenLabel}`,
      `Сумма: ${context.valueLabel}`,
      `Контракт: ${event.tokenAddress ?? event.contractAddress ?? 'n/a'}`,
      `Tx: ${context.txShort}`,
    ];
  }
}
