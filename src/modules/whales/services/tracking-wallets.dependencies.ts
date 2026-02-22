import { Inject, Injectable } from '@nestjs/common';

import { TrackingAddressService } from './tracking-address.service';
import { TrackingHistoryFormatterService } from './tracking-history-formatter.service';
import { TrackingSettingsParserService } from './tracking-settings-parser.service';
import type { IAddressCodecRegistry } from '../../../common/interfaces/address/address-codec-registry.interfaces';
import { ADDRESS_CODEC_REGISTRY } from '../../../common/interfaces/address/address-port.tokens';
import { AlertMutesRepository } from '../../../database/repositories/alert-mutes.repository';
import { SubscriptionsRepository } from '../../../database/repositories/subscriptions.repository';
import { TrackedWalletsRepository } from '../../../database/repositories/tracked-wallets.repository';
import { UserAlertPreferencesRepository } from '../../../database/repositories/user-alert-preferences.repository';
import { UserAlertSettingsRepository } from '../../../database/repositories/user-alert-settings.repository';
import { UserWalletAlertPreferencesRepository } from '../../../database/repositories/user-wallet-alert-preferences.repository';
import { UsersRepository } from '../../../database/repositories/users.repository';
import { WalletEventsRepository } from '../../../database/repositories/wallet-events.repository';

@Injectable()
export class TrackingWalletsServiceDependencies {
  @Inject(UsersRepository)
  public readonly usersRepository!: UsersRepository;
  @Inject(TrackedWalletsRepository)
  public readonly trackedWalletsRepository!: TrackedWalletsRepository;
  @Inject(SubscriptionsRepository)
  public readonly subscriptionsRepository!: SubscriptionsRepository;
  @Inject(ADDRESS_CODEC_REGISTRY)
  public readonly addressCodecRegistry!: IAddressCodecRegistry;
  @Inject(TrackingAddressService)
  public readonly trackingAddressService!: TrackingAddressService;
  @Inject(UserAlertPreferencesRepository)
  public readonly userAlertPreferencesRepository!: UserAlertPreferencesRepository;
  @Inject(UserAlertSettingsRepository)
  public readonly userAlertSettingsRepository!: UserAlertSettingsRepository;
  @Inject(UserWalletAlertPreferencesRepository)
  public readonly userWalletAlertPreferencesRepository!: UserWalletAlertPreferencesRepository;
  @Inject(AlertMutesRepository)
  public readonly alertMutesRepository!: AlertMutesRepository;
  @Inject(WalletEventsRepository)
  public readonly walletEventsRepository!: WalletEventsRepository;
  @Inject(TrackingSettingsParserService)
  public readonly settingsParserService!: TrackingSettingsParserService;
  @Inject(TrackingHistoryFormatterService)
  public readonly historyFormatter!: TrackingHistoryFormatterService;
}
