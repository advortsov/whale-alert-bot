ALTER TABLE user_alert_settings
  DROP CONSTRAINT IF EXISTS user_alert_settings_smart_filter_type_check;

ALTER TABLE user_alert_settings
  DROP COLUMN IF EXISTS exclude_dexes;

ALTER TABLE user_alert_settings
  DROP COLUMN IF EXISTS include_dexes;

ALTER TABLE user_alert_settings
  DROP COLUMN IF EXISTS smart_filter_type;
