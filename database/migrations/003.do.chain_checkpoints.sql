CREATE TABLE IF NOT EXISTS chain_checkpoints (
  chain_id INTEGER PRIMARY KEY,
  last_processed_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
