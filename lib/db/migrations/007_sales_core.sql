-- Sprint 5: Sales Core (Wiedervorlage / Follow-up, Sales Pipeline, Structured Feedback)

DO $$ BEGIN
  CREATE TYPE sales_stage AS ENUM ('neu', 'kontaktiert', 'interesse', 'angebot', 'gewonnen', 'verloren');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE interest_level AS ENUM ('hoch', 'mittel', 'niedrig', 'kein_interesse');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE feedback_reason AS ENUM ('preis', 'andere_loesung', 'keine_zeit', 'entscheider_nicht_da', 'kein_bedarf', 'spaeter_kontaktieren', 'sonstiges');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE follow_up_status AS ENUM ('open', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Market extensions
ALTER TABLE market ADD COLUMN IF NOT EXISTS sales_stage sales_stage NOT NULL DEFAULT 'neu';
ALTER TABLE market ADD COLUMN IF NOT EXISTS sales_value numeric(12, 2);
ALTER TABLE market ADD COLUMN IF NOT EXISTS no_contact boolean NOT NULL DEFAULT false;
ALTER TABLE market ADD COLUMN IF NOT EXISTS no_contact_at timestamptz;
ALTER TABLE market ADD COLUMN IF NOT EXISTS no_contact_set_by_user_id uuid REFERENCES "user"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_market_sales_stage ON market (sales_stage);
CREATE INDEX IF NOT EXISTS idx_market_no_contact ON market (company_id, no_contact);

-- Action extensions
ALTER TABLE action ADD COLUMN IF NOT EXISTS interest_level interest_level;
ALTER TABLE action ADD COLUMN IF NOT EXISTS feedback_reason feedback_reason;
ALTER TABLE action ADD COLUMN IF NOT EXISTS sales_stage sales_stage;
ALTER TABLE action ADD COLUMN IF NOT EXISTS sales_value numeric(12, 2);

-- Follow-up table
CREATE TABLE IF NOT EXISTS follow_up (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES market(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  action_id uuid REFERENCES action(id) ON DELETE SET NULL,
  due_at timestamptz NOT NULL,
  status follow_up_status NOT NULL DEFAULT 'open',
  note text,
  created_by_user_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_follow_up_market_open ON follow_up (market_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_follow_up_due_open ON follow_up (due_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_follow_up_user_open ON follow_up (user_id, due_at) WHERE status = 'open';

-- Update audit_log constraint
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_event_in_allowed_list;
ALTER TABLE audit_log ADD CONSTRAINT audit_event_in_allowed_list CHECK (event IN (
    'user_invited', 'user_invited_email_failed', 'user_invitation_resent',
    'user_activated', 'user_deactivated', 'user_role_changed',
    'market_created', 'market_updated', 'market_deactivated',
    'market_reactivated', 'market_merged', 'markets_csv_imported',
    'cooldown_rule_changed', 'chain_created', 'chain_deactivated',
    'manual_override_performed', 'reservation_cancelled_by_admin',
    'geo_anonymization_run', 'offline_conflict_reported',
    'offline_conflict_resolved', 'action_undone', 'field_interaction_recorded',
    'customer_created', 'customer_updated', 'customer_blacklisted',
    'customer_unblacklisted',
    'sales_stage_changed', 'follow_up_created', 'follow_up_updated',
    'follow_up_cancelled', 'market_no_contact_set', 'market_no_contact_cleared'
));
