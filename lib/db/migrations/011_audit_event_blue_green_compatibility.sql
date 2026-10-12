-- Keep the former S08A deletion event valid during a blue/green transition.
-- The current application writes customer_deleted; an old, still-serving
-- container may briefly write customer_deleted_outside_service_area.
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
    'follow_up_cancelled', 'market_no_contact_set', 'market_no_contact_cleared',
    'customer_deleted', 'customer_deleted_outside_service_area'
));
