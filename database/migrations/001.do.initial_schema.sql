CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracked_wallets (
  id BIGSERIAL PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_wallet_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  wallet_id BIGINT NOT NULL REFERENCES tracked_wallets (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, wallet_id)
);

CREATE TABLE IF NOT EXISTS processed_events (
  id BIGSERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  chain_id INTEGER NOT NULL,
  tracked_address TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tx_hash, log_index, chain_id, tracked_address)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_wallet_id ON user_wallet_subscriptions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON user_wallet_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_processed_events_lookup ON processed_events (tx_hash, chain_id);
