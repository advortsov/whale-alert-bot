import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';

type TimestampColumn = ColumnType<Date, Date | string | undefined, never>;
type UpdatableTimestampColumn = ColumnType<
  Date,
  Date | string | undefined,
  Date | string | undefined
>;
type NullableUpdatableTimestampColumn = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null | undefined
>;

export interface UsersTable {
  id: Generated<number>;
  telegram_id: string;
  username: string | null;
  created_at: TimestampColumn;
}

export interface TrackedWalletsTable {
  id: Generated<number>;
  chain_key: string;
  address: string;
  label: string | null;
  created_at: TimestampColumn;
}

export interface UserWalletSubscriptionsTable {
  id: Generated<number>;
  user_id: number;
  wallet_id: number;
  created_at: TimestampColumn;
}

export interface ProcessedEventsTable {
  id: Generated<number>;
  tx_hash: string;
  log_index: number;
  chain_id: number;
  chain_key: string;
  tracked_address: string;
  processed_at: TimestampColumn;
}

export interface UserAlertPreferencesTable {
  id: Generated<number>;
  user_id: number;
  min_amount: number;
  allow_transfer: boolean;
  allow_swap: boolean;
  muted_until: NullableUpdatableTimestampColumn;
  created_at: TimestampColumn;
  updated_at: UpdatableTimestampColumn;
}

export interface UserWalletAlertPreferencesTable {
  id: Generated<number>;
  user_id: number;
  wallet_id: number;
  allow_transfer: boolean;
  allow_swap: boolean;
  created_at: TimestampColumn;
  updated_at: UpdatableTimestampColumn;
}

export interface UserAlertSettingsTable {
  id: Generated<number>;
  user_id: number;
  chain_key: string;
  threshold_usd: number;
  min_amount_usd: number;
  smart_filter_type: string;
  include_dexes: string[];
  exclude_dexes: string[];
  quiet_from: string | null;
  quiet_to: string | null;
  timezone: string;
  updated_at: UpdatableTimestampColumn;
}

export interface AlertMutesTable {
  id: Generated<number>;
  user_id: number;
  chain_key: string;
  wallet_id: number;
  mute_until: UpdatableTimestampColumn;
  source: string;
  created_at: TimestampColumn;
}

export interface ChainCheckpointsTable {
  chain_id: number;
  chain_key: string;
  last_processed_block: string;
  updated_at: UpdatableTimestampColumn;
}

export interface WalletEventsTable {
  id: Generated<number>;
  chain_id: number;
  chain_key: string;
  tx_hash: string;
  log_index: number;
  tracked_address: string;
  event_type: string;
  direction: string;
  contract_address: string | null;
  token_address: string | null;
  token_symbol: string | null;
  token_decimals: number | null;
  token_amount_raw: string | null;
  value_formatted: string | null;
  dex: string | null;
  pair: string | null;
  occurred_at: TimestampColumn;
  created_at: TimestampColumn;
}

export interface Database {
  users: UsersTable;
  tracked_wallets: TrackedWalletsTable;
  user_wallet_subscriptions: UserWalletSubscriptionsTable;
  processed_events: ProcessedEventsTable;
  user_alert_preferences: UserAlertPreferencesTable;
  user_wallet_alert_preferences: UserWalletAlertPreferencesTable;
  user_alert_settings: UserAlertSettingsTable;
  alert_mutes: AlertMutesTable;
  chain_checkpoints: ChainCheckpointsTable;
  wallet_events: WalletEventsTable;
}

export type UserRow = Selectable<UsersTable>;
export type NewUserRow = Insertable<UsersTable>;

export type TrackedWalletRow = Selectable<TrackedWalletsTable>;
export type NewTrackedWalletRow = Insertable<TrackedWalletsTable>;

export type UserWalletSubscriptionRow = Selectable<UserWalletSubscriptionsTable>;
export type NewUserWalletSubscriptionRow = Insertable<UserWalletSubscriptionsTable>;

export type ProcessedEventRow = Selectable<ProcessedEventsTable>;
export type NewProcessedEventRow = Insertable<ProcessedEventsTable>;

export type UserAlertPreferenceRow = Selectable<UserAlertPreferencesTable>;
export type NewUserAlertPreferenceRow = Insertable<UserAlertPreferencesTable>;

export type UserWalletAlertPreferenceRow = Selectable<UserWalletAlertPreferencesTable>;
export type NewUserWalletAlertPreferenceRow = Insertable<UserWalletAlertPreferencesTable>;

export type UserAlertSettingsRow = Selectable<UserAlertSettingsTable>;
export type NewUserAlertSettingsRow = Insertable<UserAlertSettingsTable>;

export type AlertMuteRow = Selectable<AlertMutesTable>;
export type NewAlertMuteRow = Insertable<AlertMutesTable>;

export type ChainCheckpointRow = Selectable<ChainCheckpointsTable>;
export type NewChainCheckpointRow = Insertable<ChainCheckpointsTable>;

export type WalletEventRow = Selectable<WalletEventsTable>;
export type NewWalletEventRow = Insertable<WalletEventsTable>;
