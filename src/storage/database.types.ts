import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';

type TimestampColumn = ColumnType<Date, Date | string | undefined, never>;

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

export interface Database {
  users: UsersTable;
  tracked_wallets: TrackedWalletsTable;
  user_wallet_subscriptions: UserWalletSubscriptionsTable;
  processed_events: ProcessedEventsTable;
}

export type UserRow = Selectable<UsersTable>;
export type NewUserRow = Insertable<UsersTable>;

export type TrackedWalletRow = Selectable<TrackedWalletsTable>;
export type NewTrackedWalletRow = Insertable<TrackedWalletsTable>;

export type UserWalletSubscriptionRow = Selectable<UserWalletSubscriptionsTable>;
export type NewUserWalletSubscriptionRow = Insertable<UserWalletSubscriptionsTable>;

export type ProcessedEventRow = Selectable<ProcessedEventsTable>;
export type NewProcessedEventRow = Insertable<ProcessedEventsTable>;
