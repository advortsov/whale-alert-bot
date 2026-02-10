CREATE TABLE IF NOT EXISTS user_alert_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  chain_key TEXT NOT NULL DEFAULT 'ethereum_mainnet',
  threshold_usd NUMERIC(24, 6) NOT NULL DEFAULT 0,
  min_amount_usd NUMERIC(24, 6) NOT NULL DEFAULT 0,
  quiet_from TEXT,
  quiet_to TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chain_key)
);

CREATE INDEX IF NOT EXISTS idx_user_alert_settings_user_chain
  ON user_alert_settings (user_id, chain_key);

CREATE TABLE IF NOT EXISTS alert_mutes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  chain_key TEXT NOT NULL DEFAULT 'ethereum_mainnet',
  wallet_id BIGINT NOT NULL REFERENCES tracked_wallets (id) ON DELETE CASCADE,
  mute_until TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, chain_key, wallet_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_mutes_lookup
  ON alert_mutes (user_id, chain_key, wallet_id, mute_until);
