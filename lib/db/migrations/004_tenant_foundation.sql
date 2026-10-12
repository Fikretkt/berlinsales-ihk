-- Sprint 3: market is the tenant-owned operational customer/location.
-- Legacy markets can only be backfilled when a single company exists. This
-- deliberately refuses ambiguous multi-company legacy databases.

ALTER TABLE market ADD COLUMN company_id UUID;

DO $$
DECLARE
  market_count BIGINT;
  company_count BIGINT;
  legacy_company UUID;
BEGIN
  SELECT COUNT(*) INTO market_count FROM market;
  IF market_count = 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*), MIN(id) INTO company_count, legacy_company FROM company;
  IF company_count <> 1 THEN
    RAISE EXCEPTION
      'Cannot safely backfill market.company_id: % legacy markets and % companies exist. Assign ownership explicitly before applying migration.',
      market_count, company_count;
  END IF;

  UPDATE market SET company_id = legacy_company WHERE company_id IS NULL;
END $$;

ALTER TABLE market
  ALTER COLUMN company_id SET NOT NULL,
  ADD CONSTRAINT market_company_id_company_id_fk
    FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS idx_market_gln_active;
CREATE UNIQUE INDEX idx_market_company_gln_active
  ON market (company_id, gln)
  WHERE active = TRUE AND merged_into_id IS NULL;
CREATE INDEX idx_market_company_active ON market (company_id) WHERE active = TRUE;

-- Audit records with an actor inherit that actor's company. Actor-less system
-- events remain NULL and are not exposed by tenant audit endpoints.
ALTER TABLE audit_log ADD COLUMN company_id UUID;
UPDATE audit_log a
SET company_id = u.company_id
FROM "user" u
WHERE a.user_id = u.id AND a.company_id IS NULL;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_company_id_company_id_fk
    FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE SET NULL;
CREATE INDEX idx_audit_log_company ON audit_log (company_id, created_at DESC);
