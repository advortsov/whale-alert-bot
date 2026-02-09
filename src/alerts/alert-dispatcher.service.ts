import { Injectable, Logger } from '@nestjs/common';

import { AlertMessageFormatter } from './alert-message.formatter';
import type { ClassifiedEvent } from '../chain/chain.types';
import { SubscriptionsRepository } from '../storage/repositories/subscriptions.repository';
import { TelegramSenderService } from '../telegram/telegram-sender.service';

@Injectable()
export class AlertDispatcherService {
  private readonly logger: Logger = new Logger(AlertDispatcherService.name);

  public constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
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

    const message: string = this.alertMessageFormatter.format(event);

    this.logger.log(
      `dispatch sending eventType=${event.eventType} recipients=${telegramIds.length} txHash=${event.txHash}`,
    );
    for (const telegramId of telegramIds) {
      await this.telegramSenderService.sendText(telegramId, message);
    }
    this.logger.debug(`dispatch complete txHash=${event.txHash}`);
  }
}
