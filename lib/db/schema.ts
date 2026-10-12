import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  timestamp,
  decimal,
  integer,
  char,
  text,
  jsonb,
  customType,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";

// CITEXT custom type (PG-Extension citext, case-insensitive text)
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

// =============================================================================
// ENUMS
// =============================================================================
export const userRole = pgEnum("user_role", ["field_user", "admin"]);
export const tokenPurpose = pgEnum("token_purpose", ["reset", "setup"]);
export const actionType = pgEnum("action_type", [
  "visit",
  "profi_visit",
  "delivery",
  "control",
  "cancel_order",
  "manual_override",
]);
export const actionResult = pgEnum("action_result", [
  "success",
  "escalation",
  "declined",
  "no_contact",
  "ok",
  "problem",
]);
export const marketStatus = pgEnum("market_status", [
  "gruen",
  "blau",
  "gelb",
  "orange",
  "rosa",
  "rot",
  "grau",
]);
export const salesStage = pgEnum("sales_stage", [
  "neu",
  "kontaktiert",
  "interesse",
  "angebot",
  "gewonnen",
  "verloren",
]);
export const interestLevel = pgEnum("interest_level", [
  "hoch",
  "mittel",
  "niedrig",
  "kein_interesse",
]);
export const feedbackReason = pgEnum("feedback_reason", [
  "preis",
  "andere_loesung",
  "keine_zeit",
  "entscheider_nicht_da",
  "kein_bedarf",
  "spaeter_kontaktieren",
  "sonstiges",
]);
export const followUpStatus = pgEnum("follow_up_status", [
  "open",
  "completed",
  "cancelled",
]);
export const currentSolution = pgEnum("current_solution", [
  "keine",
  "sumup",
  "zettle",
  "verifone",
  "ingenico",
  "andere",
  "unbekannt",
]);
export const customerSatisfaction = pgEnum("customer_satisfaction", [
  "zufrieden",
  "neutral",
  "unzufrieden",
  "unbekannt",
]);

// =============================================================================
// COMPANY
// =============================================================================
export const company = pgTable("company", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// USER
// =============================================================================
export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "restrict" }),
    email: citext("email").notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }),
    name: varchar("name", { length: 200 }).notNull(),
    role: userRole("role").notNull().default("field_user"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "email_format",
      sql`${t.email} ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'`,
    ),
    index("idx_user_email").on(t.email),
    index("idx_user_company").on(t.companyId).where(sql`${t.active} = TRUE`),
  ],
);

// =============================================================================
// CUSTOMER
// =============================================================================
export const customer = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    address: text("address"),
    phone: varchar("phone", { length: 50 }),
    email: citext("email"),
    notes: text("notes"),
    blacklist: boolean("blacklist").notNull().default(false),
    blacklistReason: text("blacklist_reason"),
    assignedTo: uuid("assigned_to").references(() => user.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_customer_company_name").on(t.companyId, t.name),
    index("idx_customer_assigned").on(t.assignedTo),
    index("idx_customer_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

// =============================================================================
// PASSWORD_RESET_TOKEN
// =============================================================================
export const passwordResetToken = pgTable(
  "password_reset_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    purpose: tokenPurpose("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_password_reset_token_user").on(t.userId),
    index("idx_password_reset_token_expires")
      .on(t.expiresAt)
      .where(sql`${t.consumedAt} IS NULL`),
  ],
);

// =============================================================================
// CHAIN
// =============================================================================
export const chain = pgTable("chain", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
});

// =============================================================================
// MARKET
// =============================================================================
export const market = pgTable(
  "market",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "restrict" }),
    chainId: uuid("chain_id").references(() => chain.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    gln: char("gln", { length: 13 }),
    // Adresse als ein Feld: in den Excel-Quellen schon zusammen, vermeidet Split-Fehler
    // bei Sonderformen wie "Ackerstr. 23-26/Invalidenstr. 158".
    streetFull: varchar("street_full", { length: 250 }).notNull(),
    postalCode: char("postal_code", { length: 5 }),
    city: varchar("city", { length: 100 }),
    district: varchar("district", { length: 100 }),
    // Sales-pipeline imports may not contain coordinates. GPS and Places
    // customers still populate both values.
    lat: decimal("lat", { precision: 10, scale: 7 }),
    lng: decimal("lng", { precision: 10, scale: 7 }),
    contactPerson: varchar("contact_person", { length: 200 }),
    contactEmail: citext("contact_email"),
    contactPhone: varchar("contact_phone", { length: 50 }),
    active: boolean("active").notNull().default(true),
    mergedIntoId: uuid("merged_into_id"),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    externalId: varchar("external_id", { length: 100 }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    salesStage: salesStage("sales_stage").notNull().default("neu"),
    salesValue: decimal("sales_value", { precision: 12, scale: 2 }),
    expectedVolume: decimal("expected_volume", { precision: 12, scale: 2 }),
    probability: decimal("probability", { precision: 5, scale: 2 }),
    leadSource: varchar("lead_source", { length: 200 }),
    clientType: varchar("client_type", { length: 200 }),
    channel: varchar("channel", { length: 200 }),
    dateEntered: timestamp("date_entered", { withTimezone: true }),
    expectedClose: timestamp("expected_close", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    nextAction: text("next_action"),
    importedNotes: text("imported_notes"),
    noContact: boolean("no_contact").notNull().default(false),
    noContactAt: timestamp("no_contact_at", { withTimezone: true }),
    noContactSetByUserId: uuid("no_contact_set_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    assignedUserId: uuid("assigned_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    currentSolution: currentSolution("current_solution").notNull().default("unbekannt"),
    satisfaction: customerSatisfaction("satisfaction").notNull().default("unbekannt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.mergedIntoId],
      foreignColumns: [t.id],
      name: "market_merged_into_id_fkey",
    }),
    check("gln_format", sql`${t.gln} ~ '^[0-9]{13}$'`),
    check("postal_code_format", sql`${t.postalCode} ~ '^[0-9]{5}$'`),
    check(
      "merged_into_not_self",
      sql`${t.mergedIntoId} IS NULL OR ${t.mergedIntoId} != ${t.id}`,
    ),
    uniqueIndex("idx_market_company_gln_active")
      .on(t.companyId, t.gln)
      .where(sql`${t.active} = TRUE AND ${t.mergedIntoId} IS NULL`),
    uniqueIndex("idx_market_company_external_id")
      .on(t.companyId, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL AND ${t.mergedIntoId} IS NULL`),
    index("idx_market_chain").on(t.chainId).where(sql`${t.active} = TRUE`),
    index("idx_market_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    index("idx_market_district").on(t.district).where(sql`${t.active} = TRUE`),
    index("idx_market_postal").on(t.postalCode),
    index("idx_market_sales_stage").on(t.salesStage),
    index("idx_market_no_contact").on(t.companyId, t.noContact),
    index("idx_market_company_assigned").on(t.companyId, t.assignedUserId),
    index("idx_market_created_at").on(sql`${t.createdAt} DESC`),
  ],
);

// =============================================================================
// ACTION
// =============================================================================
export const action = pgTable(
  "action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => market.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    type: actionType("type").notNull(),
    contactType: varchar("contact_type", { length: 16 }),
    result: actionResult("result"),
    resultingStatus: marketStatus("resulting_status").notNull(),
    interestLevel: interestLevel("interest_level"),
    feedbackReason: feedbackReason("feedback_reason"),
    salesStage: salesStage("sales_stage"),
    salesValue: decimal("sales_value", { precision: 12, scale: 2 }),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
    geoLat: decimal("geo_lat", { precision: 10, scale: 7 }),
    geoLng: decimal("geo_lng", { precision: 10, scale: 7 }),
    distanceToMarketMeters: integer("distance_to_market_meters"),
    geoAnonymizedAt: timestamp("geo_anonymized_at", { withTimezone: true }),
    offlineRecorded: boolean("offline_recorded").notNull().default(false),
    clientTimestamp: timestamp("client_timestamp", { withTimezone: true }),
    clientId: varchar("client_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    check(
      "valid_type_result",
      sql`
      (${t.type} = 'visit' AND ${t.result} IN ('success','escalation','declined','no_contact'))
      OR (${t.type} = 'profi_visit' AND ${t.result} IN ('success','declined'))
      OR (${t.type} = 'delivery' AND ${t.result} IS NULL)
      OR (${t.type} = 'control' AND ${t.result} IN ('ok','problem'))
      OR (${t.type} = 'cancel_order' AND ${t.result} IS NULL)
      OR (${t.type} = 'manual_override' AND ${t.result} IS NULL)
    `,
    ),
    check(
      "manual_override_payload",
      sql`
      ${t.type} != 'manual_override'
      OR (
        ${t.payload} ? 'target_status'
        AND ${t.payload}->>'target_status' IN ('gruen','gelb','orange','rosa','rot','grau')
        AND ${t.payload} ? 'reason'
        AND length(${t.payload}->>'reason') > 0
      )
    `,
    ),
    check(
      "cancel_order_has_reason",
      sql`
      ${t.type} != 'cancel_order'
      OR (${t.payload} ? 'reason' AND length(${t.payload}->>'reason') > 0)
    `,
    ),
    check(
      "control_problem_has_description",
      sql`
      NOT (${t.type} = 'control' AND ${t.result} = 'problem')
      OR (${t.payload} ? 'problem_description' AND length(${t.payload}->>'problem_description') > 0)
    `,
    ),
    uniqueIndex("idx_action_client_id")
      .on(t.userId, t.clientId)
      .where(sql`${t.clientId} IS NOT NULL`),
    index("idx_action_market_created").on(t.marketId, sql`${t.createdAt} DESC`),
    index("idx_action_user_created").on(t.userId, sql`${t.createdAt} DESC`),
    index("idx_action_type").on(t.type, t.createdAt),
    index("idx_action_created_at").on(t.createdAt),
    index("idx_action_cooldown_until")
      .on(t.cooldownUntil)
      .where(sql`${t.cooldownUntil} IS NOT NULL`),
    index("idx_action_geo_anonymize")
      .on(t.createdAt)
      .where(sql`${t.geoAnonymizedAt} IS NULL`),
  ],
);

// =============================================================================
// NOTE
// =============================================================================
export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => market.id, { onDelete: "cascade" }),
    actionId: uuid("action_id").references(() => action.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editableUntil: timestamp("editable_until", { withTimezone: true })
      .notNull()
      .default(sql`NOW() + INTERVAL '24 hours'`),
  },
  (t) => [
    check("content_not_empty", sql`LENGTH(TRIM(${t.content})) > 0`),
    index("idx_note_market_created").on(t.marketId, sql`${t.createdAt} DESC`),
    uniqueIndex("idx_note_action").on(t.actionId).where(sql`${t.actionId} IS NOT NULL`),
  ],
);

// =============================================================================
// RESERVATION
// =============================================================================
export const reservation = pgTable(
  "reservation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => market.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    active: boolean("active").notNull().default(true),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: uuid("cancelled_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_reservation_one_active_per_market")
      .on(t.marketId)
      .where(sql`${t.active} = TRUE`),
    index("idx_reservation_user_active").on(t.userId).where(sql`${t.active} = TRUE`),
    index("idx_reservation_expires").on(t.validUntil).where(sql`${t.active} = TRUE`),
  ],
);

// =============================================================================
// COOLDOWN_RULE
// =============================================================================
export const cooldownRule = pgTable(
  "cooldown_rule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actionType: actionType("action_type").notNull(),
    result: actionResult("result"),
    durationDays: integer("duration_days").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: uuid("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    check("duration_non_negative", sql`${t.durationDays} >= 0`),
    // Zwei partial unique indexes statt COALESCE-Trick:
    // COALESCE(enum::TEXT, ...) ist nicht IMMUTABLE und blockt CREATE INDEX.
    uniqueIndex("idx_cooldown_rule_with_result")
      .on(t.actionType, t.result)
      .where(sql`${t.result} IS NOT NULL`),
    uniqueIndex("idx_cooldown_rule_no_result")
      .on(t.actionType)
      .where(sql`${t.result} IS NULL`),
  ],
);

// =============================================================================
// FOLLOW_UP
// =============================================================================
export const followUp = pgTable(
  "follow_up",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => market.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    actionId: uuid("action_id").references(() => action.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: followUpStatus("status").notNull().default("open"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_follow_up_market_open")
      .on(t.marketId)
      .where(sql`${t.status} = 'open'`),
    index("idx_follow_up_due_open")
      .on(t.dueAt)
      .where(sql`${t.status} = 'open'`),
    index("idx_follow_up_user_open")
      .on(t.userId, t.dueAt)
      .where(sql`${t.status} = 'open'`),
  ],
);

// =============================================================================
// AUDIT_LOG
// =============================================================================
// Erlaubte Event-Namen sind in lib/audit/events.ts kanonisch.
// Die DB-Check-Constraint hier muss synchron bleiben.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // System-wide maintenance events may have no tenant. All user/business
    // events must carry the actor's company and are queried through it.
    companyId: uuid("company_id").references(() => company.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    event: varchar("event", { length: 100 }).notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "audit_event_in_allowed_list",
      sql`${t.event} IN (
        'user_invited', 'user_invited_email_failed', 'user_invitation_resent',
        'user_activated', 'user_deactivated', 'user_role_changed',
        'market_created', 'market_updated', 'market_deactivated',
        'market_reactivated', 'market_merged', 'markets_csv_imported',
        'cooldown_rule_changed', 'chain_created', 'chain_deactivated',
        'manual_override_performed', 'reservation_cancelled_by_admin',
        'geo_anonymization_run',
        'offline_conflict_reported', 'offline_conflict_resolved',
        'action_undone',
        'field_interaction_recorded',
        'customer_created', 'customer_updated', 'customer_blacklisted',
        'customer_unblacklisted',
        'sales_stage_changed', 'follow_up_created', 'follow_up_updated',
        'follow_up_cancelled', 'market_no_contact_set', 'market_no_contact_cleared',
        'customer_deleted', 'customer_deleted_outside_service_area'
      )`,
    ),
    index("idx_audit_log_event").on(t.event, sql`${t.createdAt} DESC`),
    index("idx_audit_log_user").on(t.userId, sql`${t.createdAt} DESC`),
    index("idx_audit_log_company").on(t.companyId, sql`${t.createdAt} DESC`),
  ],
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================
export type Company = typeof company.$inferSelect;
export type User = typeof user.$inferSelect;
export type Customer = typeof customer.$inferSelect;
export type CustomerInsert = typeof customer.$inferInsert;
export type Market = typeof market.$inferSelect;
export type Action = typeof action.$inferSelect;
export type ActionInsert = typeof action.$inferInsert;
export type Note = typeof note.$inferSelect;
export type Reservation = typeof reservation.$inferSelect;
export type CooldownRule = typeof cooldownRule.$inferSelect;
export type FollowUp = typeof followUp.$inferSelect;
export type FollowUpInsert = typeof followUp.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type MarketStatus = (typeof marketStatus.enumValues)[number];
export type SalesStage = (typeof salesStage.enumValues)[number];
export type InterestLevel = (typeof interestLevel.enumValues)[number];
export type FeedbackReason = (typeof feedbackReason.enumValues)[number];
export type FollowUpStatus = (typeof followUpStatus.enumValues)[number];
export type ActionTypeValue = (typeof actionType.enumValues)[number];
export type ActionResultValue = (typeof actionResult.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
export type CurrentSolution = (typeof currentSolution.enumValues)[number];
export type CustomerSatisfaction = (typeof customerSatisfaction.enumValues)[number];
