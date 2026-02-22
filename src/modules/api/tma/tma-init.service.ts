import { Injectable } from '@nestjs/common';

import type { ITmaInitResult } from './tma-init.interfaces';
import { UsersRepository } from '../../../database/repositories/users.repository';
import { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';
import type { TelegramUserRef } from '../../whales/entities/tracking.interfaces';
import { TrackingService } from '../../whales/services/tracking.service';

@Injectable()
export class TmaInitService {
  public constructor(
    private readonly trackingService: TrackingService,
    private readonly usersRepository: UsersRepository,
    private readonly walletEventsRepository: WalletEventsRepository,
  ) {}

  public async loadInitData(userRef: TelegramUserRef): Promise<ITmaInitResult> {
    const user = await this.usersRepository.findOrCreate(userRef.telegramId, userRef.username);
    const [wallets, settings, todayAlertCount] = await Promise.all([
      this.trackingService.listWallets(userRef),
      this.trackingService.getSettings(userRef),
      this.walletEventsRepository.countTodayEventsByUser(user.id),
    ]);

    return {
      wallets,
      settings,
      todayAlertCount,
    };
  }
}
