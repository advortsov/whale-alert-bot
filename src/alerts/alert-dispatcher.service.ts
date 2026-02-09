import { Injectable, Logger } from '@nestjs/common';

import { AlertEnrichmentService } from './alert-enrichment.service';
import { AlertMessageFormatter } from './alert-message.formatter';
import { AlertSuppressionService } from './alert-suppression.service';
import { type AlertDeliveryResult } from './alert.interfaces';
import type { ClassifiedEvent } from '../chain/chain.types';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import { TelegramSenderService } from '../telegram/telegram-sender.service';

@Injectable()
export class AlertDispatcherService {
  private readonly logger: Logger = new Logger(AlertDispatcherService.name);

  public constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly alertEnrichmentService: AlertEnrichmentService,
    private readonly alertSuppressionService: AlertSuppressionService,
    private readonly alertMessageFormatter: AlertMessageFormatter,
    private readonly telegramSenderService: TelegramSenderService,
  ) {}

  public async dispatch(event: ClassifiedEvent): Promise<void> {
    this.logger.debug(
      `dispatch start eventType=${event.eventType} trackedAddress=${event.trackedAddress} txHash=${event.txHash}`,
    );
    const telegramIds: readonly string[] =
      await this.subscriptionsRepository.getSubscriberTelegramIdsByAddress(event.trackedAddress);

    if (telegramIds.length === 0) {
      this.logger.debug(
        `dispatch skipped no subscribers trackedAddress=${event.trackedAddress} txHash=${event.txHash}`,
      );
      return;
    }

    const suppressionDecision = this.alertSuppressionService.shouldSuppress(event);

    if (suppressionDecision.suppressed) {
      this.logger.debug(
        `dispatch suppressed eventType=${event.eventType} trackedAddress=${event.trackedAddress} txHash=${event.txHash} reason=${suppressionDecision.reason ?? 'n/a'}`,
      );
      return;
    }

    const enrichedEvent: ClassifiedEvent = this.alertEnrichmentService.enrich(event);
    const message: string = this.alertMessageFormatter.format(enrichedEvent);
    const deliveryResults: AlertDeliveryResult[] = [];

    this.logger.log(
      `dispatch sending eventType=${event.eventType} recipients=${telegramIds.length} txHash=${event.txHash}`,
    );
    for (const telegramId of telegramIds) {
      try {
        await this.telegramSenderService.sendText(telegramId, message);
        deliveryResults.push({
          telegramId,
          success: true,
          errorMessage: null,
        });
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);
        deliveryResults.push({
          telegramId,
          success: false,
          errorMessage,
        });
        this.logger.warn(
          `dispatch delivery failed telegramId=${telegramId} txHash=${event.txHash} reason=${errorMessage}`,
        );
      }
    }

    const successfulDeliveries: number = deliveryResults.filter(
      (result: AlertDeliveryResult): boolean => result.success,
    ).length;
    this.logger.debug(
      `dispatch complete txHash=${event.txHash} successful=${successfulDeliveries} failed=${deliveryResults.length - successfulDeliveries}`,
    );
  }
}
