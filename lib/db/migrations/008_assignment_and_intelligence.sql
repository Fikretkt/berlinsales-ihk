-- Sprint 6: Customer Assignment & Commercial Intelligence (Aktuelle Lösung & Zufriedenheit)

DO $$ BEGIN
  CREATE TYPE current_solution AS ENUM ('keine', 'sumup', 'zettle', 'verifone', 'ingenico', 'andere', 'unbekannt');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE customer_satisfaction AS ENUM ('zufrieden', 'neutral', 'unzufrieden', 'unbekannt');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Market extensions: assignment & customer-level intelligence
ALTER TABLE market ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE market ADD COLUMN IF NOT EXISTS current_solution current_solution NOT NULL DEFAULT 'unbekannt';
ALTER TABLE market ADD COLUMN IF NOT EXISTS satisfaction customer_satisfaction NOT NULL DEFAULT 'unbekannt';

CREATE INDEX IF NOT EXISTS idx_market_company_assigned ON market (company_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_market_current_solution ON market (company_id, current_solution);
CREATE INDEX IF NOT EXISTS idx_market_satisfaction ON market (company_id, satisfaction);
