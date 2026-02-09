import { Injectable } from '@nestjs/common';

import { ClassifiedEventType, EventDirection, type ClassifiedEvent } from '../chain/chain.types';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class AlertMessageFormatter {
  public constructor(private readonly appConfigService: AppConfigService) {}

  public format(event: ClassifiedEvent): string {
    const txUrl: string = `${this.appConfigService.etherscanTxBaseUrl}${event.txHash}`;
    const directionLabel: string = this.formatDirection(event.direction);
    const valueLabel: string = this.formatValue(event.valueFormatted, event.tokenSymbol);
    const tokenLabel: string = event.tokenSymbol ?? 'n/a';

    if (event.eventType === ClassifiedEventType.TRANSFER) {
      return [
        '🐋 КИТ АКТИВЕН! Тип: TRANSFER',
        `Адрес: ${event.trackedAddress}`,
        `Направление: ${directionLabel}`,
        `Токен: ${tokenLabel}`,
        `Сумма: ${valueLabel}`,
        `Контракт: ${event.tokenAddress ?? event.contractAddress ?? 'n/a'}`,
        `Tx: ${txUrl}`,
      ].join('\n');
    }

    if (event.eventType === ClassifiedEventType.SWAP) {
      return [
        '🐋 КИТ АКТИВЕН! Тип: SWAP',
        `Адрес: ${event.trackedAddress}`,
        `Направление: ${directionLabel}`,
        `DEX: ${event.dex ?? 'Unknown'}`,
        `Пара: ${event.pair ?? 'n/a'}`,
        `Токен: ${tokenLabel}`,
        `Сумма: ${valueLabel}`,
        `Контракт: ${event.tokenAddress ?? event.contractAddress ?? 'n/a'}`,
        `Tx: ${txUrl}`,
      ].join('\n');
    }

    return ['Событие не классифицировано.', `Tx: ${txUrl}`].join('\n');
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
}
