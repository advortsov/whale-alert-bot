import type { IUserSettingsResult } from '../../whales/interfaces/tracking-settings.result';
import type { IWalletListResult } from '../../whales/interfaces/tracking-wallets.result';

export interface ITmaInitResult {
  readonly wallets: IWalletListResult;
  readonly settings: IUserSettingsResult;
  readonly todayAlertCount: number;
}
