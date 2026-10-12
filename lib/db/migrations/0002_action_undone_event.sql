-- =============================================================================
-- 0002: Audit-Event 'action_undone' für Rückgängig-Funktion erweitern
-- =============================================================================
-- Field User können binnen 30 Sekunden eine Aktion zurückziehen (Lastenheft 5.1).
-- Wir DELETEn die Action und schreiben einen Audit-Eintrag mit den
-- Original-Daten als Payload, damit die Geschäftshistorie erhalten bleibt.

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_event_in_allowed_list;

ALTER TABLE audit_log ADD CONSTRAINT audit_event_in_allowed_list CHECK (event IN (
    'user_invited', 'user_invited_email_failed', 'user_invitation_resent',
    'user_activated', 'user_deactivated', 'user_role_changed',
    'market_created', 'market_updated', 'market_deactivated',
    'market_reactivated', 'market_merged', 'markets_csv_imported',
    'cooldown_rule_changed', 'chain_created', 'chain_deactivated',
    'manual_override_performed', 'reservation_cancelled_by_admin',
    'geo_anonymization_run',
    'offline_conflict_reported', 'offline_conflict_resolved',
    'action_undone'
));
