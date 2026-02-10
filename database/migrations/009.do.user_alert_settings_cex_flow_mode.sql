ALTER TABLE user_alert_settings
  ADD COLUMN IF NOT EXISTS cex_flow_mode TEXT NOT NULL DEFAULT 'off';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_alert_settings_cex_flow_mode_check'
  ) THEN
    ALTER TABLE user_alert_settings
      ADD CONSTRAINT user_alert_settings_cex_flow_mode_check
      CHECK (cex_flow_mode IN ('off', 'in', 'out', 'all'));
  END IF;
END
$$;
