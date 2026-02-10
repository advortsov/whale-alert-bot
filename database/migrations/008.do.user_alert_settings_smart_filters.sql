ALTER TABLE user_alert_settings
  ADD COLUMN IF NOT EXISTS smart_filter_type TEXT NOT NULL DEFAULT 'all';

ALTER TABLE user_alert_settings
  ADD COLUMN IF NOT EXISTS include_dexes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE user_alert_settings
  ADD COLUMN IF NOT EXISTS exclude_dexes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_alert_settings_smart_filter_type_check'
  ) THEN
    ALTER TABLE user_alert_settings
      ADD CONSTRAINT user_alert_settings_smart_filter_type_check
      CHECK (smart_filter_type IN ('all', 'buy', 'sell', 'transfer'));
  END IF;
END
$$;
