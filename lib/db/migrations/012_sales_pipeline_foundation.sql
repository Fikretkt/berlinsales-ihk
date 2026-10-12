-- Phase 001: Excel/CSV sales pipeline foundation.
-- Imported pipeline rows have no coordinates, while existing GPS/Places rows
-- continue to use the same market table.
ALTER TABLE market
  ADD COLUMN IF NOT EXISTS contact_email citext,
  ADD COLUMN IF NOT EXISTS expected_volume numeric(12, 2),
  ADD COLUMN IF NOT EXISTS probability numeric(5, 2),
  ADD COLUMN IF NOT EXISTS lead_source varchar(200),
  ADD COLUMN IF NOT EXISTS client_type varchar(200),
  ADD COLUMN IF NOT EXISTS channel varchar(200),
  ADD COLUMN IF NOT EXISTS date_entered timestamptz,
  ADD COLUMN IF NOT EXISTS expected_close timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS imported_notes text;

ALTER TABLE market
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lng DROP NOT NULL;
