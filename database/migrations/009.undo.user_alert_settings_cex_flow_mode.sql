ALTER TABLE user_alert_settings
  DROP CONSTRAINT IF EXISTS user_alert_settings_cex_flow_mode_check;

ALTER TABLE user_alert_settings
  DROP COLUMN IF EXISTS cex_flow_mode;
