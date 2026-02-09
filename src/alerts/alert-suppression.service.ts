import { Injectable } from '@nestjs/common';

import { AlertSuppressionReason, type AlertSuppressionDecision } from './alert.interfaces';
import { ClassifiedEventType, type ClassifiedEvent } from '../chain/chain.types';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class AlertSuppressionService {
  private readonly lastEventByKey: Map<string, number> = new Map<string, number>();

  public constructor(private readonly appConfigService: AppConfigService) {}

  public shouldSuppress(
    event: ClassifiedEvent,
    nowEpochMs: number = Date.now(),
  ): AlertSuppressionDecision {
    if (event.eventType === ClassifiedEventType.TRANSFER && event.tokenAmountRaw === '0') {
      return {
        suppressed: true,
        reason: AlertSuppressionReason.ZERO_AMOUNT,
      };
    }

    const minIntervalMs: number = this.appConfigService.alertMinSendIntervalSec * 1000;

    if (minIntervalMs <= 0) {
      return {
        suppressed: false,
        reason: null,
      };
    }

    const suppressionKey: string = this.buildSuppressionKey(event);
    const lastSentEpochMs: number | undefined = this.lastEventByKey.get(suppressionKey);

    if (lastSentEpochMs !== undefined && nowEpochMs - lastSentEpochMs < minIntervalMs) {
      return {
        suppressed: true,
        reason: AlertSuppressionReason.MIN_INTERVAL,
      };
    }

    this.lastEventByKey.set(suppressionKey, nowEpochMs);

    return {
      suppressed: false,
      reason: null,
    };
  }

  private buildSuppressionKey(event: ClassifiedEvent): string {
    return [
      event.trackedAddress.toLowerCase(),
      event.eventType,
      event.contractAddress?.toLowerCase() ?? 'none',
    ].join(':');
  }
}
