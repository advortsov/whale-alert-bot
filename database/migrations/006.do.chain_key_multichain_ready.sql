ALTER TABLE tracked_wallets
  ADD COLUMN IF NOT EXISTS chain_key TEXT;

UPDATE tracked_wallets
SET chain_key = 'ethereum_mainnet'
WHERE chain_key IS NULL;

ALTER TABLE tracked_wallets
  ALTER COLUMN chain_key SET DEFAULT 'ethereum_mainnet';

ALTER TABLE tracked_wallets
  ALTER COLUMN chain_key SET NOT NULL;

ALTER TABLE tracked_wallets
  DROP CONSTRAINT IF EXISTS tracked_wallets_address_key;

ALTER TABLE tracked_wallets
  ADD CONSTRAINT tracked_wallets_chain_key_address_key UNIQUE (chain_key, address);

CREATE INDEX IF NOT EXISTS idx_tracked_wallets_chain_key ON tracked_wallets (chain_key);

ALTER TABLE processed_events
  ADD COLUMN IF NOT EXISTS chain_key TEXT;

UPDATE processed_events
SET chain_key = 'ethereum_mainnet'
WHERE chain_key IS NULL;

ALTER TABLE processed_events
  ALTER COLUMN chain_key SET DEFAULT 'ethereum_mainnet';

ALTER TABLE processed_events
  ALTER COLUMN chain_key SET NOT NULL;

ALTER TABLE processed_events
  DROP CONSTRAINT IF EXISTS processed_events_tx_hash_log_index_chain_id_tracked_address_key;

ALTER TABLE processed_events
  ADD CONSTRAINT processed_events_tx_hash_log_index_chain_key_tracked_address_key UNIQUE (
    tx_hash,
    log_index,
    chain_key,
    tracked_address
  );

CREATE INDEX IF NOT EXISTS idx_processed_events_chain_key ON processed_events (chain_key);

ALTER TABLE wallet_events
  ADD COLUMN IF NOT EXISTS chain_key TEXT;

UPDATE wallet_events
SET chain_key = 'ethereum_mainnet'
WHERE chain_key IS NULL;

ALTER TABLE wallet_events
  ALTER COLUMN chain_key SET DEFAULT 'ethereum_mainnet';

ALTER TABLE wallet_events
  ALTER COLUMN chain_key SET NOT NULL;

ALTER TABLE wallet_events
  DROP CONSTRAINT IF EXISTS wallet_events_tx_hash_log_index_chain_id_tracked_address_key;

ALTER TABLE wallet_events
  ADD CONSTRAINT wallet_events_tx_hash_log_index_chain_key_tracked_address_key UNIQUE (
    tx_hash,
    log_index,
    chain_key,
    tracked_address
  );

CREATE INDEX IF NOT EXISTS idx_wallet_events_chain_key ON wallet_events (chain_key);

ALTER TABLE chain_checkpoints
  ADD COLUMN IF NOT EXISTS chain_key TEXT;

UPDATE chain_checkpoints
SET chain_key = 'ethereum_mainnet'
WHERE chain_key IS NULL;

ALTER TABLE chain_checkpoints
  ALTER COLUMN chain_key SET DEFAULT 'ethereum_mainnet';

ALTER TABLE chain_checkpoints
  ALTER COLUMN chain_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chain_checkpoints_chain_key
  ON chain_checkpoints (chain_key);
