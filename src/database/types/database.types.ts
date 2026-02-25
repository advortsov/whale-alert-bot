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

export interface IUsersTable {
  id: Generated<number>;
  telegram_id: string;
  username: string | null;
  created_at: TimestampColumn;
}

export interface ITrackedWalletsTable {
  id: Generated<number>;
  chain_key: string;
  address: string;
  label: string | null;
  created_at: TimestampColumn;
}

export interface IUserWalletSubscriptionsTable {
  id: Generated<number>;
  user_id: number;
  wallet_id: number;
  created_at: TimestampColumn;
}

export interface IProcessedEventsTable {
  id: Generated<number>;
  tx_hash: string;
  log_index: number;
  chain_id: number;
  chain_key: string;
  tracked_address: string;
  processed_at: TimestampColumn;
}

export interface IUserAlertPreferencesTable {
  id: Generated<number>;
  user_id: number;
  min_amount: number;
  allow_transfer: boolean;
  allow_swap: boolean;
  muted_until: NullableUpdatableTimestampColumn;
  created_at: TimestampColumn;
  updated_at: UpdatableTimestampColumn;
}

export interface IUserWalletAlertPreferencesTable {
  id: Generated<number>;
  user_id: number;
  wallet_id: number;
  allow_transfer: boolean;
  allow_swap: boolean;
  created_at: TimestampColumn;
  updated_at: UpdatableTimestampColumn;
}

export interface IUserAlertSettingsTable {
  id: Generated<number>;
  user_id: number;
  chain_key: string;
  threshold_usd: number;
  min_amount_usd: number;
  cex_flow_mode: string;
  smart_filter_type: string;
  include_dexes: string[];
  exclude_dexes: string[];
  quiet_from: string | null;
  quiet_to: string | null;
  timezone: string;
  updated_at: UpdatableTimestampColumn;
}

export interface IAlertMutesTable {
  id: Generated<number>;
  user_id: number;
  chain_key: string;
  wallet_id: number;
  mute_until: UpdatableTimestampColumn;
  source: string;
  created_at: TimestampColumn;
}

export interface IChainCheckpointsTable {
  chain_id: number;
  chain_key: string;
  last_processed_block: string;
  updated_at: UpdatableTimestampColumn;
}

export interface IWalletEventsTable {
  id: Generated<number>;
  chain_id: number;
  chain_key: string;
  tx_hash: string;
  log_index: number;
  tracked_address: string;
  event_type: string;
  direction: string;
  asset_standard: string;
  contract_address: string | null;
  token_address: string | null;
  token_symbol: string | null;
  token_decimals: number | null;
  token_amount_raw: string | null;
  value_formatted: string | null;
  counterparty_address: string | null;
  dex: string | null;
  pair: string | null;
  usd_price: number | null;
  usd_amount: number | null;
  usd_unavailable: boolean;
  swap_from_symbol: string | null;
  swap_from_amount_text: string | null;
  swap_to_symbol: string | null;
  swap_to_amount_text: string | null;
  occurred_at: TimestampColumn;
  created_at: TimestampColumn;
}

export interface IDatabase {
  users: IUsersTable;
  tracked_wallets: ITrackedWalletsTable;
  user_wallet_subscriptions: IUserWalletSubscriptionsTable;
  processed_events: IProcessedEventsTable;
  user_alert_preferences: IUserAlertPreferencesTable;
  user_wallet_alert_preferences: IUserWalletAlertPreferencesTable;
  user_alert_settings: IUserAlertSettingsTable;
  alert_mutes: IAlertMutesTable;
  chain_checkpoints: IChainCheckpointsTable;
  wallet_events: IWalletEventsTable;
}

export type UserRow = Selectable<IUsersTable>;
export type NewUserRow = Insertable<IUsersTable>;

export type TrackedWalletRow = Selectable<ITrackedWalletsTable>;
export type NewTrackedWalletRow = Insertable<ITrackedWalletsTable>;

export type UserWalletSubscriptionRow = Selectable<IUserWalletSubscriptionsTable>;
export type NewUserWalletSubscriptionRow = Insertable<IUserWalletSubscriptionsTable>;

export type NewProcessedEventRow = Insertable<IProcessedEventsTable>;

export type UserAlertPreferenceRow = Selectable<IUserAlertPreferencesTable>;
export type NewUserAlertPreferenceRow = Insertable<IUserAlertPreferencesTable>;

export type UserWalletAlertPreferenceRow = Selectable<IUserWalletAlertPreferencesTable>;
export type NewUserWalletAlertPreferenceRow = Insertable<IUserWalletAlertPreferencesTable>;

export type UserAlertSettingsRow = Selectable<IUserAlertSettingsTable>;
export type NewUserAlertSettingsRow = Insertable<IUserAlertSettingsTable>;

export type AlertMuteRow = Selectable<IAlertMutesTable>;
export type NewAlertMuteRow = Insertable<IAlertMutesTable>;

export type ChainCheckpointRow = Selectable<IChainCheckpointsTable>;
export type NewChainCheckpointRow = Insertable<IChainCheckpointsTable>;

export type NewWalletEventRow = Insertable<IWalletEventsTable>;
