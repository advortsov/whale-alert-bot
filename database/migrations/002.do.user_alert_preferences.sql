CREATE TABLE IF NOT EXISTS user_alert_preferences (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  min_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
  allow_transfer BOOLEAN NOT NULL DEFAULT TRUE,
  allow_swap BOOLEAN NOT NULL DEFAULT TRUE,
  muted_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_alert_preferences_user_id ON user_alert_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_user_alert_preferences_muted_until ON user_alert_preferences (muted_until);
