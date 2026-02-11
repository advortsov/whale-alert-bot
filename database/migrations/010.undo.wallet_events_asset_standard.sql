DROP INDEX IF EXISTS idx_wallet_events_asset_standard;

ALTER TABLE wallet_events
  DROP COLUMN IF EXISTS asset_standard;
