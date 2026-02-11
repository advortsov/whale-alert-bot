ALTER TABLE wallet_events
  ADD COLUMN IF NOT EXISTS asset_standard TEXT;

UPDATE wallet_events
SET asset_standard = CASE
  WHEN chain_key = 'ethereum_mainnet' AND token_address IS NOT NULL THEN 'ERC20'
  WHEN chain_key = 'solana_mainnet' AND token_symbol = 'SPL' THEN 'SPL'
  WHEN chain_key = 'tron_mainnet' AND token_address IS NOT NULL THEN 'TRC20'
  WHEN chain_key = 'tron_mainnet' AND token_symbol = 'TRC10' THEN 'TRC10'
  ELSE 'NATIVE'
END
WHERE asset_standard IS NULL;

ALTER TABLE wallet_events
  ALTER COLUMN asset_standard SET DEFAULT 'NATIVE';

ALTER TABLE wallet_events
  ALTER COLUMN asset_standard SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_events_asset_standard
  ON wallet_events (asset_standard);
