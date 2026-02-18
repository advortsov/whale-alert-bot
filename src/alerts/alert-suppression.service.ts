import { Injectable } from '@nestjs/common';

import { AlertSuppressionReason, type AlertSuppressionDecision } from './alert.interfaces';
import { ClassifiedEventType, type ClassifiedEvent } from '../common/interfaces/chain.types';
import { SimpleCacheImpl } from '../common/utils/cache';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class AlertSuppressionService {
  private readonly suppressionCache: SimpleCacheImpl<true>;

  public constructor(private readonly appConfigService: AppConfigService) {
    this.suppressionCache = new SimpleCacheImpl<true>({
      ttlSec: this.appConfigService.alertMinSendIntervalSec,
    });
  }

  public shouldSuppress(event: ClassifiedEvent): AlertSuppressionDecision {
    if (event.eventType === ClassifiedEventType.TRANSFER && event.tokenAmountRaw === '0') {
      return {
        suppressed: true,
        reason: AlertSuppressionReason.ZERO_AMOUNT,
      };
    }

    const minIntervalSec: number = this.appConfigService.alertMinSendIntervalSec;

    if (minIntervalSec <= 0) {
      return {
        suppressed: false,
        reason: null,
      };
    }

    const suppressionKey: string = this.buildSuppressionKey(event);

    if (this.suppressionCache.has(suppressionKey)) {
      return {
        suppressed: true,
        reason: AlertSuppressionReason.MIN_INTERVAL,
      };
    }

    this.suppressionCache.set(suppressionKey, true);

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
