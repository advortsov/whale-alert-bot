ALTER TABLE wallet_events
  DROP COLUMN IF EXISTS swap_to_amount_text,
  DROP COLUMN IF EXISTS swap_to_symbol,
  DROP COLUMN IF EXISTS swap_from_amount_text,
  DROP COLUMN IF EXISTS swap_from_symbol,
  DROP COLUMN IF EXISTS usd_unavailable,
  DROP COLUMN IF EXISTS usd_amount,
  DROP COLUMN IF EXISTS usd_price;
