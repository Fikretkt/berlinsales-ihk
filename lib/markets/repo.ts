// Markt-Repository: Liste, Detail, mit View v_market_status für computed_status.
// Cursor-Pagination via base64-encoded (created_at, id).

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { SalesStage, CurrentSolution, CustomerSatisfaction } from "@/lib/db/schema";

export interface MarketListItem {
  id: string;
  name: string;
  gln: string | null;
  chain: { id: string; name: string } | null;
  streetFull: string;
  postalCode: string | null;
  city: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  computedStatus:
    | "gruen"
    | "blau"
    | "gelb"
    | "orange"
    | "rosa"
    | "rot"
    | "grau";
  reservedByUserId: string | null;
  reservationValidUntil: Date | null;
  cooldownUntil: Date | null;
  lastActionAt: Date | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  currentSolution: CurrentSolution;
  satisfaction: CustomerSatisfaction;
  createdAt: Date;
}

export interface MarketListFilters {
  status?: string[];
  chainId?: string;
  withoutChain?: boolean;
  district?: string;
  search?: string;
  lastContact?: "never" | "today" | "7d" | "30d" | "older_than_30d";
  contactType?: "visit" | "phone" | "email" | "other";
  reservedByMe?: boolean;
  assignedToMe?: boolean;
  assignedUserId?: string;
  limit?: number;
  cursor?: string | null;
}

interface RawListRow {
  id: string;
  name: string;
  gln: string | null;
  chain_id: string | null;
  chain_name: string | null;
  street_full: string;
  postal_code: string | null;
  city: string | null;
  district: string | null;
  lat: string | null;
  lng: string | null;
  computed_status: string;
  reserved_by_user_id: string | null;
  reservation_valid_until: Date | null;
  cooldown_until: Date | null;
  last_action_at: Date | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  current_solution: CurrentSolution;
  satisfaction: CustomerSatisfaction;
  created_at: Date;
  [key: string]: unknown;
}

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(s: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    if (typeof c.createdAt !== "string" || typeof c.id !== "string") return null;
    return c;
  } catch {
    return null;
  }
}

// Computed-Status-CASE wird hier dupliziert (statt View) damit wir alles in einem
// Query haben und auf computed_status filtern können (Views sind oft nicht filter-effizient).
const COMPUTED_STATUS_SQL = sql`
  CASE
    WHEN m.active = FALSE THEN 'grau'::market_status
    WHEN la.cooldown_until IS NOT NULL AND la.cooldown_until > NOW() THEN 'rot'::market_status
    WHEN la.resulting_status IS NOT NULL THEN la.resulting_status
    ELSE 'gruen'::market_status
  END
`;

export interface MarketMapMarker {
  id: string;
  name: string;
  streetFull: string;
  district: string | null;
  lat: number;
  lng: number;
  computedStatus: MarketListItem["computedStatus"];
  reservedByUserId: string | null;
  assignedUserId: string | null;
}

interface RawMapMarker {
  id: string;
  name: string;
  street_full: string;
  district: string | null;
  lat: string;
  lng: string;
  computed_status: string;
  reserved_by_user_id: string | null;
  assigned_user_id: string | null;

  [key: string]: unknown;
}

function marketConditions(
  companyId: string,
  userId: string,
  filters: MarketListFilters,
): ReturnType<typeof sql>[] {
  const conditions: ReturnType<typeof sql>[] = [
    sql`m.merged_into_id IS NULL`,
    sql`m.company_id = ${companyId}::uuid`,
  ];
  if (filters.chainId) conditions.push(sql`m.chain_id = ${filters.chainId}::uuid`);
  if (filters.withoutChain) conditions.push(sql`m.chain_id IS NULL`);
  if (filters.district) conditions.push(sql`m.district = ${filters.district}`);
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(sql`(
      m.name ILIKE ${term} OR m.street_full ILIKE ${term}
      OR m.gln LIKE ${`${filters.search}%`} OR m.postal_code LIKE ${`${filters.search}%`}
    )`);
  }
  if (filters.status?.length) {
    const statuses = sql.join(filters.status.map((status) => sql`${status}::market_status`), sql`, `);
    conditions.push(sql`(${COMPUTED_STATUS_SQL}) IN (${statuses})`);
  }
  if (filters.lastContact === "never") conditions.push(sql`la.last_action_at IS NULL`);
  if (filters.lastContact === "today") conditions.push(sql`la.last_action_at >= date_trunc('day', NOW())`);
  if (filters.lastContact === "7d") conditions.push(sql`la.last_action_at >= NOW() - INTERVAL '7 days'`);
  if (filters.lastContact === "30d") conditions.push(sql`la.last_action_at >= NOW() - INTERVAL '30 days'`);
  if (filters.lastContact === "older_than_30d") {
    conditions.push(sql`la.last_action_at < NOW() - INTERVAL '30 days'`);
  }
  if (filters.contactType) conditions.push(sql`la.contact_type = ${filters.contactType}`);
  if (filters.reservedByMe) conditions.push(sql`ar.reserved_by_user_id = ${userId}::uuid`);
  if (filters.assignedToMe) conditions.push(sql`m.assigned_user_id = ${userId}::uuid`);
  if (filters.assignedUserId) conditions.push(sql`m.assigned_user_id = ${filters.assignedUserId}::uuid`);
  return conditions;
}

export async function listMarketFilterOptions(companyId: string): Promise<{
  districts: string[];
  chains: { id: string; name: string }[];
}> {
  const [districts, chains] = await Promise.all([
    db.execute<{ district: string }>(sql`
      SELECT DISTINCT district FROM market
      WHERE company_id = ${companyId}::uuid AND merged_into_id IS NULL AND district IS NOT NULL
      ORDER BY district
    `),
    db.execute<{ id: string; name: string }>(sql`
      SELECT DISTINCT c.id, c.name FROM chain c
      INNER JOIN market m ON m.chain_id = c.id
      WHERE m.company_id = ${companyId}::uuid AND m.merged_into_id IS NULL
      ORDER BY c.name
    `),
  ]);
  return { districts: districts.rows.map((row) => row.district), chains: chains.rows };
}

export async function listMarketMapMarkers(
  companyId: string,
  userId: string,
  filters: MarketListFilters = {},
): Promise<MarketMapMarker[]> {
  const whereClause = sql.join(marketConditions(companyId, userId, filters), sql` AND `);
  const result = await db.execute<RawMapMarker>(sql`
    SELECT
      m.id, m.name, m.street_full, m.district,
      m.lat::text, m.lng::text,
      (${COMPUTED_STATUS_SQL}) AS computed_status,
      ar.reserved_by_user_id,
      m.assigned_user_id
    FROM market m
    LEFT JOIN LATERAL (
      SELECT a.resulting_status, a.cooldown_until, a.created_at AS last_action_at, a.contact_type
      FROM action a
      WHERE a.market_id = m.id
      ORDER BY a.created_at DESC
      LIMIT 1
    ) la ON TRUE
    LEFT JOIN LATERAL (
      SELECT r.user_id AS reserved_by_user_id
      FROM reservation r
      WHERE r.market_id = m.id AND r.active = TRUE AND r.valid_until > NOW()
      LIMIT 1
    ) ar ON TRUE
    WHERE ${whereClause}
      AND m.lat IS NOT NULL
      AND m.lng IS NOT NULL
    ORDER BY m.created_at DESC, m.id DESC
  `);

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    streetFull: row.street_full,
    district: row.district,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lng),
    computedStatus: row.computed_status as MarketListItem["computedStatus"],
    reservedByUserId: row.reserved_by_user_id,
    assignedUserId: row.assigned_user_id,
  }));
}

export async function listMarkets(
  companyId: string,
  userId: string,
  filters: MarketListFilters,
): Promise<{ items: MarketListItem[]; nextCursor: string | null }> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;

  // Wir bauen den Query manuell als raw SQL für volle Kontrolle.
  // Drizzle's QueryBuilder kann CASE in WHERE etwas umständlich.
  const conditions = marketConditions(companyId, userId, filters);
  if (cursor) {
    conditions.push(
      sql`(m.created_at, m.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const result = await db.execute<RawListRow>(sql`
    SELECT
      m.id, m.name, m.gln,
      m.chain_id, c.name AS chain_name,
      m.street_full, m.postal_code, m.city, m.district,
      m.lat::text, m.lng::text,
      (${COMPUTED_STATUS_SQL}) AS computed_status,
      m.assigned_user_id,
      au.name AS assigned_user_name,
      m.current_solution,
      m.satisfaction,
      ar.reserved_by_user_id,
      ar.reservation_valid_until,
      la.cooldown_until,
      la.last_action_at,
      m.created_at
    FROM market m
    LEFT JOIN chain c ON c.id = m.chain_id
    LEFT JOIN "user" au ON au.id = m.assigned_user_id
    LEFT JOIN LATERAL (
      SELECT a.resulting_status, a.cooldown_until, a.created_at AS last_action_at, a.contact_type
      FROM action a
      WHERE a.market_id = m.id
      ORDER BY a.created_at DESC
      LIMIT 1
    ) la ON TRUE
    LEFT JOIN LATERAL (
      SELECT r.user_id AS reserved_by_user_id, r.valid_until AS reservation_valid_until
      FROM reservation r
      WHERE r.market_id = m.id AND r.active = TRUE AND r.valid_until > NOW()
      LIMIT 1
    ) ar ON TRUE
    WHERE ${whereClause}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${limit + 1}
  `);

  const rows = result.rows as RawListRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const items: MarketListItem[] = page.map((r) => ({
    id: r.id,
    name: r.name,
    gln: r.gln,
    chain: r.chain_id && r.chain_name ? { id: r.chain_id, name: r.chain_name } : null,
    streetFull: r.street_full,
    postalCode: r.postal_code,
    city: r.city,
    district: r.district,
    lat: r.lat == null ? null : parseFloat(r.lat),
    lng: r.lng == null ? null : parseFloat(r.lng),
    computedStatus: r.computed_status as MarketListItem["computedStatus"],
    reservedByUserId: r.reserved_by_user_id,
    reservationValidUntil: r.reservation_valid_until,
    cooldownUntil: r.cooldown_until,
    lastActionAt: r.last_action_at,
    assignedUserId: r.assigned_user_id,
    assignedUserName: r.assigned_user_name,
    currentSolution: (r.current_solution as CurrentSolution) ?? "unbekannt",
    satisfaction: (r.satisfaction as CustomerSatisfaction) ?? "unbekannt",
    createdAt: r.created_at,
  }));

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = page[page.length - 1]!;
    nextCursor = encodeCursor({
      createdAt: new Date(last.created_at).toISOString(),
      id: last.id,
    });
  }

  return { items, nextCursor };
}

// =============================================================================
// Detail
// =============================================================================
export interface MarketDetail extends MarketListItem {
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  updatedAt: Date;
  lastAction: LastActionDetail | null;
  salesStage: SalesStage;
  salesValue: number | null;
  expectedVolume: number | null;
  probability: number | null;
  leadSource: string | null;
  clientType: string | null;
  channel: string | null;
  dateEntered: Date | null;
  expectedClose: Date | null;
  lastActivityAt: Date | null;
  nextAction: string | null;
  importedNotes: string | null;
  noContact: boolean;
  noContactAt: Date | null;
  assignedUser: { id: string; name: string; email: string } | null;
  nextFollowUp: {
    id: string;
    dueAt: Date;
    userId: string;
    userName: string;
  } | null;
}

export interface LastActionDetail {
  id: string;
  type: string;
  result: string | null;
  resultingStatus: string;
  cooldownUntil: Date | null;
  userId: string;
  userName: string;
  contactType: string | null;
  interestLevel: string | null;
  createdAt: Date;
  payload: Record<string, unknown>;
}

export interface MarketMergedResult {
  kind: "merged";
  mergedIntoId: string;
}
export interface MarketNotFoundResult {
  kind: "not_found";
}
export interface MarketOkResult {
  kind: "ok";
  market: MarketDetail;
}
export type MarketDetailResult =
  | MarketMergedResult
  | MarketNotFoundResult
  | MarketOkResult;

interface RawDetailRow extends RawListRow {
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  updated_at: Date;
  merged_into_id: string | null;
  sales_stage: string;
  sales_value: string | null;
  expected_volume: string | null;
  probability: string | null;
  lead_source: string | null;
  client_type: string | null;
  channel: string | null;
  date_entered: Date | null;
  expected_close: Date | null;
  last_activity_at: Date | null;
  next_action: string | null;
  imported_notes: string | null;
  no_contact: boolean;
  no_contact_at: Date | null;
  assigned_user_email: string | null;
  next_follow_up_id: string | null;
  next_follow_up_due_at: Date | null;
  next_follow_up_user_id: string | null;
  next_follow_up_user_name: string | null;
  last_action_id: string | null;
  last_action_type: string | null;
  last_action_result: string | null;
  last_action_resulting_status: string | null;
  last_action_user_id: string | null;
  last_action_user_name: string | null;
  last_action_contact_type: string | null;
  last_action_interest_level: string | null;
  last_action_payload: Record<string, unknown> | null;
  [key: string]: unknown;
}

export async function getMarketDetail(companyId: string, id: string): Promise<MarketDetailResult> {
  const result = await db.execute<RawDetailRow>(sql`
    SELECT
      m.id, m.name, m.gln,
      m.chain_id, c.name AS chain_name,
      m.street_full, m.postal_code, m.city, m.district,
      m.lat::text, m.lng::text,
      m.contact_person, m.contact_email, m.contact_phone,
      m.active, m.merged_into_id,
      m.sales_stage,
      m.sales_value::text AS sales_value,
      m.expected_volume::text AS expected_volume,
      m.probability::text AS probability,
      m.lead_source,
      m.client_type,
      m.channel,
      m.date_entered,
      m.expected_close,
      m.last_activity_at,
      m.next_action,
      m.imported_notes,
      m.no_contact,
      m.no_contact_at,
      m.created_at, m.updated_at,
      (${COMPUTED_STATUS_SQL}) AS computed_status,
      m.assigned_user_id,
      au.name AS assigned_user_name,
      au.email AS assigned_user_email,
      m.current_solution,
      m.satisfaction,
      la.id AS last_action_id,
      la.type AS last_action_type,
      la.result AS last_action_result,
      la.resulting_status AS last_action_resulting_status,
      la.cooldown_until,
      la.user_id AS last_action_user_id,
      lau.name AS last_action_user_name,
      la.created_at AS last_action_at,
      la.contact_type AS last_action_contact_type,
      la.interest_level AS last_action_interest_level,
      la.payload AS last_action_payload,
      ar.reserved_by_user_id,
      ar.reservation_valid_until,
      nfu.id AS next_follow_up_id,
      nfu.due_at AS next_follow_up_due_at,
      nfu.user_id AS next_follow_up_user_id,
      nfu.user_name AS next_follow_up_user_name
    FROM market m
    LEFT JOIN chain c ON c.id = m.chain_id
    LEFT JOIN "user" au ON au.id = m.assigned_user_id
    LEFT JOIN LATERAL (
      SELECT a.*
      FROM action a
      WHERE a.market_id = m.id
      ORDER BY a.created_at DESC
      LIMIT 1
    ) la ON TRUE
    LEFT JOIN "user" lau ON lau.id = la.user_id
    LEFT JOIN LATERAL (
      SELECT r.user_id AS reserved_by_user_id, r.valid_until AS reservation_valid_until
      FROM reservation r
      WHERE r.market_id = m.id AND r.active = TRUE AND r.valid_until > NOW()
      LIMIT 1
    ) ar ON TRUE
    LEFT JOIN LATERAL (
      SELECT fu.id, fu.due_at, fu.user_id, fuu.name AS user_name
      FROM follow_up fu
      LEFT JOIN "user" fuu ON fuu.id = fu.user_id
      WHERE fu.market_id = m.id AND fu.status = 'open'
      ORDER BY fu.due_at ASC
      LIMIT 1
    ) nfu ON TRUE
    WHERE m.id = ${id}::uuid AND m.company_id = ${companyId}::uuid
    LIMIT 1
  `);

  const row = result.rows[0] as RawDetailRow | undefined;
  if (!row) return { kind: "not_found" };
  if (row.merged_into_id) {
    return { kind: "merged", mergedIntoId: row.merged_into_id };
  }

  const lastAction: LastActionDetail | null = row.last_action_id
    ? {
        id: row.last_action_id,
        type: row.last_action_type!,
        result: row.last_action_result,
        resultingStatus: row.last_action_resulting_status!,
        cooldownUntil: row.cooldown_until,
        userId: row.last_action_user_id!,
        userName: row.last_action_user_name ?? "Unbekannt",
        contactType: row.last_action_contact_type,
        interestLevel: row.last_action_interest_level,
        createdAt: row.last_action_at!,
        payload: row.last_action_payload ?? {},
      }
    : null;

  const nextFollowUp = row.next_follow_up_id
    ? {
        id: row.next_follow_up_id,
        dueAt: row.next_follow_up_due_at!,
        userId: row.next_follow_up_user_id!,
        userName: row.next_follow_up_user_name ?? "Unbekannt",
      }
    : null;

  const market: MarketDetail = {
    id: row.id,
    name: row.name,
    gln: row.gln,
    chain: row.chain_id && row.chain_name ? { id: row.chain_id, name: row.chain_name } : null,
    streetFull: row.street_full,
    postalCode: row.postal_code,
    city: row.city,
    district: row.district,
    lat: row.lat == null ? null : parseFloat(row.lat),
    lng: row.lng == null ? null : parseFloat(row.lng),
    contactPerson: row.contact_person,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    computedStatus: row.computed_status as MarketListItem["computedStatus"],
    salesStage: (row.sales_stage as SalesStage) ?? "neu",
    salesValue: row.sales_value != null ? parseFloat(row.sales_value) : null,
    expectedVolume: row.expected_volume != null ? parseFloat(row.expected_volume) : null,
    probability: row.probability != null ? parseFloat(row.probability) : null,
    leadSource: row.lead_source,
    clientType: row.client_type,
    channel: row.channel,
    dateEntered: row.date_entered,
    expectedClose: row.expected_close,
    lastActivityAt: row.last_activity_at,
    nextAction: row.next_action,
    importedNotes: row.imported_notes,
    noContact: row.no_contact ?? false,
    noContactAt: row.no_contact_at ?? null,
    nextFollowUp,
    reservedByUserId: row.reserved_by_user_id,
    reservationValidUntil: row.reservation_valid_until,
    cooldownUntil: row.cooldown_until,
    lastActionAt: row.last_action_at,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    assignedUser: row.assigned_user_id
      ? {
          id: row.assigned_user_id,
          name: row.assigned_user_name ?? "Unbekannt",
          email: row.assigned_user_email ?? "",
        }
      : null,
    currentSolution: (row.current_solution as CurrentSolution) ?? "unbekannt",
    satisfaction: (row.satisfaction as CustomerSatisfaction) ?? "unbekannt",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAction,
  };
  return { kind: "ok", market };
}
