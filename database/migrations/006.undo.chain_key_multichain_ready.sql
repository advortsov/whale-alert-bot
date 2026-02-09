DROP INDEX IF EXISTS uq_chain_checkpoints_chain_key;
DROP INDEX IF EXISTS idx_wallet_events_chain_key;
DROP INDEX IF EXISTS idx_processed_events_chain_key;
DROP INDEX IF EXISTS idx_tracked_wallets_chain_key;

ALTER TABLE wallet_events
  DROP CONSTRAINT IF EXISTS wallet_events_tx_hash_log_index_chain_key_tracked_address_key;

ALTER TABLE wallet_events
  ADD CONSTRAINT wallet_events_tx_hash_log_index_chain_id_tracked_address_key UNIQUE (
    tx_hash,
    log_index,
    chain_id,
    tracked_address
  );

ALTER TABLE processed_events
  DROP CONSTRAINT IF EXISTS processed_events_tx_hash_log_index_chain_key_tracked_address_key;

ALTER TABLE processed_events
  ADD CONSTRAINT processed_events_tx_hash_log_index_chain_id_tracked_address_key UNIQUE (
    tx_hash,
    log_index,
    chain_id,
    tracked_address
  );

ALTER TABLE tracked_wallets
  DROP CONSTRAINT IF EXISTS tracked_wallets_chain_key_address_key;

ALTER TABLE tracked_wallets
  ADD CONSTRAINT tracked_wallets_address_key UNIQUE (address);

ALTER TABLE chain_checkpoints
  DROP COLUMN IF EXISTS chain_key;

ALTER TABLE wallet_events
  DROP COLUMN IF EXISTS chain_key;

ALTER TABLE processed_events
  DROP COLUMN IF EXISTS chain_key;

ALTER TABLE tracked_wallets
  DROP COLUMN IF EXISTS chain_key;
