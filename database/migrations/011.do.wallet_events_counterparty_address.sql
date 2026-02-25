ALTER TABLE wallet_events
  ADD COLUMN IF NOT EXISTS counterparty_address text NULL;
