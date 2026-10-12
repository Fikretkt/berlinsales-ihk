// Single Source of Truth für Audit-Event-Namen.
// MUSS synchron mit der DB-Check-Constraint in lib/db/schema.ts bleiben.
// Bei neuen Events: hier ergänzen + Migration für die Check-Constraint.

export const AUDIT_EVENTS = {
  // User-Management
  USER_INVITED: "user_invited",
  USER_INVITED_EMAIL_FAILED: "user_invited_email_failed",
  USER_INVITATION_RESENT: "user_invitation_resent",
  USER_ACTIVATED: "user_activated",
  USER_DEACTIVATED: "user_deactivated",
  USER_ROLE_CHANGED: "user_role_changed",

  // Markt-Management
  MARKET_CREATED: "market_created",
  MARKET_UPDATED: "market_updated",
  MARKET_DEACTIVATED: "market_deactivated",
  MARKET_REACTIVATED: "market_reactivated",
  MARKET_MERGED: "market_merged",
  MARKETS_CSV_IMPORTED: "markets_csv_imported",

  // Konfiguration
  COOLDOWN_RULE_CHANGED: "cooldown_rule_changed",
  CHAIN_CREATED: "chain_created",
  CHAIN_DEACTIVATED: "chain_deactivated",

  // Aktions-Eingriffe (alle Admin)
  MANUAL_OVERRIDE_PERFORMED: "manual_override_performed",
  RESERVATION_CANCELLED_BY_ADMIN: "reservation_cancelled_by_admin",

  // System-Jobs
  GEO_ANONYMIZATION_RUN: "geo_anonymization_run",

  // Konflikt-Berichte (Field User → Admin)
  OFFLINE_CONFLICT_REPORTED: "offline_conflict_reported",
  OFFLINE_CONFLICT_RESOLVED: "offline_conflict_resolved",

  // Rückgängig-Funktion (Field User, 30s-Fenster)
  ACTION_UNDONE: "action_undone",
  FIELD_INTERACTION_RECORDED: "field_interaction_recorded",

  // Kunden-Management
  CUSTOMER_CREATED: "customer_created",
  CUSTOMER_UPDATED: "customer_updated",
  CUSTOMER_BLACKLISTED: "customer_blacklisted",
  CUSTOMER_UNBLACKLISTED: "customer_unblacklisted",

  // Sales Core (Sprint 5)
  SALES_STAGE_CHANGED: "sales_stage_changed",
  FOLLOW_UP_CREATED: "follow_up_created",
  FOLLOW_UP_UPDATED: "follow_up_updated",
  FOLLOW_UP_CANCELLED: "follow_up_cancelled",
  MARKET_NO_CONTACT_SET: "market_no_contact_set",
  MARKET_NO_CONTACT_CLEARED: "market_no_contact_cleared",
  CUSTOMER_DELETED: "customer_deleted",
} as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[keyof typeof AUDIT_EVENTS];
