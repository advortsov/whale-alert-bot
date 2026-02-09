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

export interface ChainCheckpointsTable {
  chain_id: number;
  last_processed_block: string;
  updated_at: UpdatableTimestampColumn;
}

export interface Database {
  users: UsersTable;
  tracked_wallets: TrackedWalletsTable;
  user_wallet_subscriptions: UserWalletSubscriptionsTable;
  processed_events: ProcessedEventsTable;
  user_alert_preferences: UserAlertPreferencesTable;
  chain_checkpoints: ChainCheckpointsTable;
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

export type ChainCheckpointRow = Selectable<ChainCheckpointsTable>;
export type NewChainCheckpointRow = Insertable<ChainCheckpointsTable>;
