CREATE TABLE IF NOT EXISTS user_wallet_alert_preferences (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  wallet_id BIGINT NOT NULL REFERENCES tracked_wallets (id) ON DELETE CASCADE,
  allow_transfer BOOLEAN NOT NULL DEFAULT TRUE,
  allow_swap BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, wallet_id)
);

CREATE INDEX IF NOT EXISTS idx_user_wallet_alert_preferences_user_id
  ON user_wallet_alert_preferences (user_id);

CREATE INDEX IF NOT EXISTS idx_user_wallet_alert_preferences_wallet_id
  ON user_wallet_alert_preferences (wallet_id);
