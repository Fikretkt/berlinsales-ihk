-- Field interactions reuse action status semantics and add only contact metadata.
ALTER TABLE action ADD COLUMN contact_type varchar(16);
ALTER TABLE action ADD CONSTRAINT action_contact_type_valid
  CHECK (contact_type IS NULL OR contact_type IN ('visit', 'phone', 'email', 'other'));

ALTER TABLE note ADD COLUMN action_id uuid REFERENCES action(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_note_action ON note (action_id) WHERE action_id IS NOT NULL;

ALTER TABLE audit_log DROP CONSTRAINT audit_event_in_allowed_list;
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
    'customer_unblacklisted'
));
