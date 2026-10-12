-- Google Places records do not have a GLN, chain, postal code, or separate city.
-- Existing ITMART records and their GLN uniqueness remain unchanged.
ALTER TABLE market
  ALTER COLUMN chain_id DROP NOT NULL,
  ALTER COLUMN gln DROP NOT NULL,
  ALTER COLUMN postal_code DROP NOT NULL,
  ALTER COLUMN city DROP NOT NULL;

CREATE UNIQUE INDEX idx_market_company_external_id
  ON market (company_id, external_id)
  WHERE external_id IS NOT NULL AND merged_into_id IS NULL;
