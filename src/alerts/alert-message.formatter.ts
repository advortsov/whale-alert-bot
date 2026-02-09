import { Injectable } from '@nestjs/common';

import { ClassifiedEventType, type ClassifiedEvent } from '../chain/chain.types';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class AlertMessageFormatter {
  public constructor(private readonly appConfigService: AppConfigService) {}

  public format(event: ClassifiedEvent): string {
    const txUrl: string = `${this.appConfigService.etherscanTxBaseUrl}${event.txHash}`;

    if (event.eventType === ClassifiedEventType.TRANSFER) {
      const amountText: string = event.tokenAmountRaw
        ? `Сумма (raw): ${event.tokenAmountRaw}`
        : 'Сумма: n/a';

      return [
        '🐋 КИТ АКТИВЕН! Тип: TRANSFER',
        `Адрес: ${event.trackedAddress}`,
        `Контракт: ${event.contractAddress ?? 'n/a'}`,
        amountText,
        `Tx: ${txUrl}`,
      ].join('\n');
    }

    if (event.eventType === ClassifiedEventType.SWAP) {
      return [
        '🐋 КИТ АКТИВЕН! Тип: SWAP',
        `Адрес: ${event.trackedAddress}`,
        `DEX: ${event.dex ?? 'Unknown'}`,
        `Пара: ${event.pair ?? 'n/a'}`,
        `Контракт: ${event.contractAddress ?? 'n/a'}`,
        `Tx: ${txUrl}`,
      ].join('\n');
    }

    return ['Событие не классифицировано.', `Tx: ${txUrl}`].join('\n');
  }
}
