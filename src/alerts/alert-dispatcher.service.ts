import { Injectable, Logger } from '@nestjs/common';

import { AlertEnrichmentService } from './alert-enrichment.service';
import { AlertMessageFormatter } from './alert-message.formatter';
import { AlertSuppressionService } from './alert-suppression.service';
import { type AlertDeliveryResult } from './alert.interfaces';
import { ClassifiedEventType, type ClassifiedEvent } from '../chain/chain.types';
import type { UserAlertPreferenceRow } from '../storage/database.types';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import type { SubscriberWalletRecipient } from '../storage/repositories/subscriptions.repository.interfaces';
import { UserAlertPreferencesRepository } from '../storage/repositories/user-alert-preferences.repository';
import { UserWalletAlertPreferencesRepository } from '../storage/repositories/user-wallet-alert-preferences.repository';
import { TelegramSenderService } from '../telegram/telegram-sender.service';

@Injectable()
export class AlertDispatcherService {
  private readonly logger: Logger = new Logger(AlertDispatcherService.name);

  public constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly alertEnrichmentService: AlertEnrichmentService,
    private readonly alertSuppressionService: AlertSuppressionService,
    private readonly alertMessageFormatter: AlertMessageFormatter,
    private readonly userAlertPreferencesRepository: UserAlertPreferencesRepository,
    private readonly userWalletAlertPreferencesRepository: UserWalletAlertPreferencesRepository,
    private readonly telegramSenderService: TelegramSenderService,
  ) {}

  public async dispatch(event: ClassifiedEvent): Promise<void> {
    this.logger.debug(
      `dispatch start eventType=${event.eventType} trackedAddress=${event.trackedAddress} txHash=${event.txHash}`,
    );
    const subscribers: readonly SubscriberWalletRecipient[] =
      await this.subscriptionsRepository.listSubscriberWalletRecipientsByAddress(
        event.trackedAddress,
      );

    if (subscribers.length === 0) {
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
      `dispatch sending eventType=${event.eventType} recipients=${subscribers.length} txHash=${event.txHash}`,
    );
    for (const subscriber of subscribers) {
      const shouldSkipByPreferences: boolean = await this.shouldSkipByUserPreferences(
        subscriber,
        enrichedEvent,
      );

      if (shouldSkipByPreferences) {
        this.logger.debug(
          `dispatch skipped by user preferences telegramId=${subscriber.telegramId} walletId=${String(subscriber.walletId)} txHash=${event.txHash}`,
        );
        continue;
      }

      try {
        await this.telegramSenderService.sendText(subscriber.telegramId, message);
        deliveryResults.push({
          telegramId: subscriber.telegramId,
          success: true,
          errorMessage: null,
        });
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);
        deliveryResults.push({
          telegramId: subscriber.telegramId,
          success: false,
          errorMessage,
        });
        this.logger.warn(
          `dispatch delivery failed telegramId=${subscriber.telegramId} walletId=${String(subscriber.walletId)} txHash=${event.txHash} reason=${errorMessage}`,
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

  private async shouldSkipByUserPreferences(
    subscriber: SubscriberWalletRecipient,
    event: ClassifiedEvent,
  ): Promise<boolean> {
    const preferences: UserAlertPreferenceRow =
      await this.userAlertPreferencesRepository.findOrCreateByUserId(subscriber.userId);
    const walletPreferences = await this.userWalletAlertPreferencesRepository.findByUserAndWalletId(
      subscriber.userId,
      subscriber.walletId,
    );
    const allowTransfer: boolean = walletPreferences
      ? walletPreferences.allow_transfer
      : preferences.allow_transfer;
    const allowSwap: boolean = walletPreferences
      ? walletPreferences.allow_swap
      : preferences.allow_swap;

    if (preferences.muted_until !== null && preferences.muted_until.getTime() > Date.now()) {
      return true;
    }

    if (event.eventType === ClassifiedEventType.TRANSFER && !allowTransfer) {
      return true;
    }

    if (event.eventType === ClassifiedEventType.SWAP && !allowSwap) {
      return true;
    }

    const minAmount: number = Number.parseFloat(String(preferences.min_amount));

    if (Number.isNaN(minAmount) || minAmount <= 0) {
      return false;
    }

    const value: number | null = event.valueFormatted
      ? Number.parseFloat(event.valueFormatted)
      : null;

    if (value === null || Number.isNaN(value)) {
      return true;
    }

    return value < minAmount;
  }
}
