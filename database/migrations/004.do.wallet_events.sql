CREATE TABLE IF NOT EXISTS wallet_events (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  tracked_address TEXT NOT NULL,
  event_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  contract_address TEXT,
  token_address TEXT,
  token_symbol TEXT,
  token_decimals INTEGER,
  token_amount_raw TEXT,
  value_formatted TEXT,
  dex TEXT,
  pair TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tx_hash, log_index, chain_id, tracked_address)
);

CREATE INDEX IF NOT EXISTS idx_wallet_events_lookup
  ON wallet_events (tracked_address, occurred_at DESC);
