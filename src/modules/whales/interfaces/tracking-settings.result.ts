import type {
  UserAlertPreferences,
  UserAlertSettingsSnapshot,
} from '../entities/tracking.interfaces';

export interface IUserSettingsResult {
  readonly preferences: UserAlertPreferences;
  readonly settings: UserAlertSettingsSnapshot;
}

export interface IUserStatusResult extends IUserSettingsResult {
  readonly historyQuota: {
    readonly minuteUsed: number;
    readonly minuteLimit: number;
    readonly minuteRemaining: number;
  };
}
