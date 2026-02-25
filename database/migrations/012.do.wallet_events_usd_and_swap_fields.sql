ALTER TABLE wallet_events
  ADD COLUMN IF NOT EXISTS usd_price double precision NULL,
  ADD COLUMN IF NOT EXISTS usd_amount double precision NULL,
  ADD COLUMN IF NOT EXISTS usd_unavailable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS swap_from_symbol text NULL,
  ADD COLUMN IF NOT EXISTS swap_from_amount_text text NULL,
  ADD COLUMN IF NOT EXISTS swap_to_symbol text NULL,
  ADD COLUMN IF NOT EXISTS swap_to_amount_text text NULL;
