// Markt-CRUD-Operationen (Anlegen, Bearbeiten, Deaktivieren, Reaktivieren, Mergen).

import { sql, eq, and, ne, isNull } from "drizzle-orm";
import { db, pool } from "@/lib/db/client";
import {
  market as marketTable,
  user as userTable,
  note as noteTable,
  action as actionTable,
  reservation as reservationTable,
  chain as chainTable,
  auditLog,
  type CurrentSolution,
  type CustomerSatisfaction,
} from "@/lib/db/schema";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { notifyMarketUpdated, notifyMarketsBulkUpdated } from "@/lib/sse/notify";

export interface CreateMarketInput {
  chainId?: string | null;
  name: string;
  gln?: string | null;
  streetFull: string;
  postalCode?: string | null;
  city?: string | null;
  district?: string | null;
  lat: number;
  lng: number;
  contactPerson?: string | null;
  contactPhone?: string | null;
  assignedUserId?: string | null;
  currentSolution?: CurrentSolution;
  satisfaction?: CustomerSatisfaction;
}

export interface CreateMarketResult {
  marketId: string;
  warning?: { similarMarkets: SimilarMarket[] };
}

export interface SimilarMarket {
  id: string;
  name: string;
  streetFull: string;
  city: string;
  similarity: number;
}

const PG = pool;

function mapPgError(err: unknown, fallbackMessage: string): never {
  const code = (err as { code?: string })?.code;
  if (code === "23505") {
    throw new HttpError(409, "GLN_ALREADY_USED", "Diese GLN ist bereits aktiv vergeben");
  }
  if (code === "23514") {
    throw new HttpError(400, "VALIDATION_FAILED", fallbackMessage);
  }
  throw err;
}

// =============================================================================
// CREATE
// =============================================================================
export async function createMarket(
  input: CreateMarketInput,
  user: SessionUser,
): Promise<CreateMarketResult> {
  // Chain existiert?
  if (input.chainId) {
    const chainRows = await db
      .select({ id: chainTable.id })
      .from(chainTable)
      .where(eq(chainTable.id, input.chainId))
      .limit(1);
    if (chainRows.length === 0) {
      throw new HttpError(400, "VALIDATION_FAILED", "Unbekannte Kette", {
        field: "chain_id",
      });
    }
  }

  // Zuweisung prüfen
  if (input.assignedUserId) {
    if (user.role !== "admin") {
      throw new HttpError(403, "ADMIN_ONLY", "Nur Administratoren können Kunden zuweisen");
    }
    const assignedUserRows = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(
        and(
          eq(userTable.id, input.assignedUserId),
          eq(userTable.companyId, user.companyId),
          eq(userTable.active, true),
        ),
      )
      .limit(1);
    if (assignedUserRows.length === 0) {
      throw new HttpError(
        400,
        "INVALID_ASSIGNED_USER",
        "Zugewiesener Mitarbeiter existiert nicht oder gehört nicht zu Ihrem Unternehmen",
      );
    }
  }

  // Trigram-Suche nach ähnlichen Namen (gleicher Postal-Code-Bezirk)
  const similarResult = input.postalCode
    ? await db.execute<SimilarMarket & { [k: string]: unknown }>(sql`
    SELECT
      id,
      name,
      street_full AS "streetFull",
      city,
      similarity(name, ${input.name}) AS similarity
    FROM market
    WHERE company_id = ${user.companyId}::uuid AND active = TRUE AND merged_into_id IS NULL
      AND postal_code = ${input.postalCode}
      AND similarity(name, ${input.name}) > 0.4
    ORDER BY similarity DESC
    LIMIT 5
  `)
    : { rows: [] as (SimilarMarket & { [k: string]: unknown })[] };
  const similar = similarResult.rows.map((r) => ({
    id: r.id,
    name: r.name,
    streetFull: r.streetFull,
    city: r.city,
    similarity: Number(r.similarity),
  }));

  let marketId: string;
  try {
    const res = await db
      .insert(marketTable)
      .values({
        companyId: user.companyId,
        chainId: input.chainId ?? null,
        name: input.name,
        gln: input.gln ?? null,
        streetFull: input.streetFull,
        postalCode: input.postalCode ?? null,
        city: input.city ?? null,
        district: input.district ?? null,
        lat: input.lat.toFixed(7),
        lng: input.lng.toFixed(7),
        contactPerson: input.contactPerson ?? null,
        contactPhone: input.contactPhone ?? null,
        assignedUserId: input.assignedUserId ?? null,
        currentSolution: input.currentSolution ?? "unbekannt",
        satisfaction: input.satisfaction ?? "unbekannt",
        createdByUserId: user.id,
      })
      .returning({ id: marketTable.id });
    marketId = res[0]!.id;
  } catch (err) {
    mapPgError(err, "Markt-Daten ungültig");
  }

  await db.insert(auditLog).values({
    companyId: user.companyId,
    userId: user.id,
    event: AUDIT_EVENTS.MARKET_CREATED,
    payload: {
      market_id: marketId!,
      name: input.name,
      gln: input.gln,
      via: "manual_create",
    },
  });

  return {
    marketId: marketId!,
    ...(similar.length > 0 ? { warning: { similarMarkets: similar } } : {}),
  };
}

// =============================================================================
// UPDATE
// =============================================================================
export interface UpdateMarketInput {
  name?: string;
  chainId?: string;
  streetFull?: string;
  postalCode?: string;
  city?: string;
  district?: string | null;
  lat?: number;
  lng?: number;
  contactPerson?: string | null;
  contactPhone?: string | null;
  assignedUserId?: string | null;
  currentSolution?: CurrentSolution;
  satisfaction?: CustomerSatisfaction;
}

export async function updateMarket(
  id: string,
  input: UpdateMarketInput,
  user: SessionUser,
): Promise<void> {
  const existing = await db
    .select({ id: marketTable.id, mergedIntoId: marketTable.mergedIntoId })
    .from(marketTable)
    .where(and(eq(marketTable.id, id), eq(marketTable.companyId, user.companyId)))
    .limit(1);
  if (existing.length === 0) {
    throw new HttpError(404, "MARKET_NOT_FOUND", "Markt nicht gefunden");
  }
  if (existing[0]!.mergedIntoId) {
    throw new HttpError(409, "MARKET_MERGED", "Markt wurde zusammengeführt");
  }

  const adminFields = [
    "name",
    "chainId",
    "streetFull",
    "postalCode",
    "city",
    "district",
    "lat",
    "lng",
    "contactPerson",
    "contactPhone",
    "assignedUserId",
  ] as const;

  const hasAdminField = adminFields.some((field) => input[field] !== undefined);
  if (hasAdminField && user.role !== "admin") {
    throw new HttpError(
      403,
      "ADMIN_ONLY",
      "Nur Administratoren können Stammdaten oder Zuweisungen bearbeiten",
    );
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.chainId !== undefined) updates.chainId = input.chainId;
  if (input.streetFull !== undefined) updates.streetFull = input.streetFull;
  if (input.postalCode !== undefined) updates.postalCode = input.postalCode;
  if (input.city !== undefined) updates.city = input.city;
  if (input.district !== undefined) updates.district = input.district;
  if (input.lat !== undefined) updates.lat = input.lat.toFixed(7);
  if (input.lng !== undefined) updates.lng = input.lng.toFixed(7);
  if (input.contactPerson !== undefined) updates.contactPerson = input.contactPerson;
  if (input.contactPhone !== undefined) updates.contactPhone = input.contactPhone;

  if (input.assignedUserId !== undefined) {
    if (input.assignedUserId !== null) {
      const assignedUserRows = await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(
          and(
            eq(userTable.id, input.assignedUserId),
            eq(userTable.companyId, user.companyId),
            eq(userTable.active, true),
          ),
        )
        .limit(1);
      if (assignedUserRows.length === 0) {
        throw new HttpError(
          400,
          "INVALID_ASSIGNED_USER",
          "Zugewiesener Mitarbeiter existiert nicht oder gehört nicht zu Ihrem Unternehmen",
        );
      }
    }
    updates.assignedUserId = input.assignedUserId;
  }

  if (input.currentSolution !== undefined) {
    updates.currentSolution = input.currentSolution;
  }
  if (input.satisfaction !== undefined) {
    updates.satisfaction = input.satisfaction;
  }

  if (Object.keys(updates).length === 0) return;

  try {
    await db
      .update(marketTable)
      .set(updates)
      .where(and(eq(marketTable.id, id), eq(marketTable.companyId, user.companyId)));
  } catch (err) {
    mapPgError(err, "Markt-Daten ungültig");
  }

  await db.insert(auditLog).values({
    companyId: user.companyId,
    userId: user.id,
    event: AUDIT_EVENTS.MARKET_UPDATED,
    payload: {
      market_id: id,
      changed_fields: Object.keys(updates),
      ...(updates.assignedUserId !== undefined
        ? { assigned_user_id: updates.assignedUserId }
        : {}),
      ...(updates.currentSolution !== undefined
        ? { current_solution: updates.currentSolution }
        : {}),
      ...(updates.satisfaction !== undefined
        ? { satisfaction: updates.satisfaction }
        : {}),
    },
  });

  // Notify nur wenn relevante Felder geändert wurden (UI-Refetch zwecks neuer Adresse, Name)
  notifyMarketUpdated(id, "_metadata_changed").catch(() => {});
}

// =============================================================================
// DEACTIVATE / REACTIVATE
// =============================================================================
export async function deactivateMarket(id: string, user: SessionUser): Promise<void> {
  const rows = await db
    .select({ active: marketTable.active, mergedIntoId: marketTable.mergedIntoId })
    .from(marketTable)
    .where(and(eq(marketTable.id, id), eq(marketTable.companyId, user.companyId)))
    .limit(1);
  if (rows.length === 0)
    throw new HttpError(404, "MARKET_NOT_FOUND", "Markt nicht gefunden");
  if (rows[0]!.mergedIntoId)
    throw new HttpError(409, "MARKET_MERGED", "Markt wurde zusammengeführt");
  if (!rows[0]!.active) return;

  await db.transaction(async (tx) => {
    await tx.update(marketTable).set({ active: false }).where(and(eq(marketTable.id, id), eq(marketTable.companyId, user.companyId)));
    // Aktive Reservierungen aufheben
    await tx
      .update(reservationTable)
      .set({
        active: false,
        cancelledAt: sql`NOW()`,
        cancelledByUserId: user.id,
      })
      .where(and(eq(reservationTable.marketId, id), eq(reservationTable.active, true)));
    await tx.insert(auditLog).values({
      companyId: user.companyId,
      userId: user.id,
      event: AUDIT_EVENTS.MARKET_DEACTIVATED,
      payload: { market_id: id },
    });
  });
  notifyMarketUpdated(id, "grau").catch(() => {});
}

export async function reactivateMarket(id: string, user: SessionUser): Promise<void> {
  const rows = await db
    .select({ active: marketTable.active, mergedIntoId: marketTable.mergedIntoId })
    .from(marketTable)
    .where(and(eq(marketTable.id, id), eq(marketTable.companyId, user.companyId)))
    .limit(1);
  if (rows.length === 0)
    throw new HttpError(404, "MARKET_NOT_FOUND", "Markt nicht gefunden");
  if (rows[0]!.mergedIntoId)
    throw new HttpError(409, "MARKET_MERGED", "Markt wurde zusammengeführt");
  if (rows[0]!.active) return;

  await db.transaction(async (tx) => {
    await tx.update(marketTable).set({ active: true }).where(and(eq(marketTable.id, id), eq(marketTable.companyId, user.companyId)));
    await tx.insert(auditLog).values({
      companyId: user.companyId,
      userId: user.id,
      event: AUDIT_EVENTS.MARKET_REACTIVATED,
      payload: { market_id: id },
    });
  });
  notifyMarketUpdated(id, "_reactivated").catch(() => {});
}

// =============================================================================
// MERGE
// =============================================================================
export interface MergeResult {
  notesMoved: number;
  actionsMoved: number;
  reservationsCancelled: number;
}

export async function mergeMarkets(
  primaryId: string,
  duplicateId: string,
  user: SessionUser,
): Promise<MergeResult> {
  if (primaryId === duplicateId) {
    throw new HttpError(400, "VALIDATION_FAILED", "Primary und Duplikat müssen unterschiedlich sein");
  }

  // Beide existieren + nicht gemergt
  const rows = await db
    .select({ id: marketTable.id, mergedIntoId: marketTable.mergedIntoId })
    .from(marketTable)
    .where(sql`${marketTable.id} = ANY(ARRAY[${primaryId}::uuid, ${duplicateId}::uuid]) AND ${marketTable.companyId} = ${user.companyId}::uuid`);
  const primary = rows.find((r) => r.id === primaryId);
  const duplicate = rows.find((r) => r.id === duplicateId);
  if (!primary || !duplicate) {
    throw new HttpError(404, "MARKET_NOT_FOUND", "Ein Markt wurde nicht gefunden");
  }
  if (primary.mergedIntoId || duplicate.mergedIntoId) {
    throw new HttpError(409, "MARKET_MERGED", "Mindestens ein Markt ist bereits gemergt");
  }

  const result: MergeResult = {
    notesMoved: 0,
    actionsMoved: 0,
    reservationsCancelled: 0,
  };

  // Beide Locks in sortierter Reihenfolge (deadlock-vermeidung)
  const sorted = [primaryId, duplicateId].sort();
  const client = await PG.connect();
  try {
    await client.query("BEGIN");
    for (const id of sorted) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [id]);
    }

    const notes = await client.query(
      `UPDATE note SET market_id = $1 WHERE market_id = $2 RETURNING id`,
      [primaryId, duplicateId],
    );
    result.notesMoved = notes.rowCount ?? 0;

    const actions = await client.query(
      `UPDATE action SET market_id = $1 WHERE market_id = $2 RETURNING id`,
      [primaryId, duplicateId],
    );
    result.actionsMoved = actions.rowCount ?? 0;

    const reservations = await client.query(
      `UPDATE reservation SET active = FALSE, cancelled_at = NOW(), cancelled_by_user_id = $3
       WHERE market_id = $2 AND active = TRUE RETURNING id`,
      [primaryId, duplicateId, user.id],
    );
    result.reservationsCancelled = reservations.rowCount ?? 0;

    await client.query(
      `UPDATE market SET active = FALSE, merged_into_id = $1 WHERE id = $2 AND company_id = $3`,
      [primaryId, duplicateId, user.companyId],
    );

    await client.query(
      `INSERT INTO audit_log (company_id, user_id, event, payload) VALUES ($1, $2, $3, $4::jsonb)`,
      [
        user.companyId,
        user.id,
        AUDIT_EVENTS.MARKET_MERGED,
        JSON.stringify({
          primary_id: primaryId,
          duplicate_id: duplicateId,
          notes_moved: result.notesMoved,
          actions_moved: result.actionsMoved,
          reservations_cancelled: result.reservationsCancelled,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Beide Märkte updaten
  notifyMarketsBulkUpdated([primaryId, duplicateId]).catch(() => {});

  return result;
}

// =============================================================================
// Markt-Liste auch inaktive (für Admin-Übersicht)
// =============================================================================
export interface AdminMarketListItem {
  id: string;
  name: string;
  gln: string | null;
  chainName: string | null;
  city: string | null;
  postalCode: string | null;
  district: string | null;
  streetFull: string;
  active: boolean;
  mergedIntoId: string | null;
  createdAt: Date;
  createdByName: string | null;
}

export async function listAdminMarkets(companyId: string, opts: {
  search?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: AdminMarketListItem[]; total: number }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;

  const conditions: ReturnType<typeof sql>[] = [sql`m.company_id = ${companyId}::uuid`];
  if (!opts.includeInactive) {
    conditions.push(sql`m.active = TRUE AND m.merged_into_id IS NULL`);
  }
  if (opts.search) {
    const term = `%${opts.search}%`;
    conditions.push(sql`(m.name ILIKE ${term} OR m.gln LIKE ${`${opts.search}%`} OR m.street_full ILIKE ${term})`);
  }
  const where = conditions.length ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const result = await db.execute<AdminMarketListItem & { [k: string]: unknown }>(sql`
    SELECT
      m.id, m.name, m.gln,
      c.name AS "chainName",
      m.city, m.postal_code AS "postalCode",
      m.district, m.street_full AS "streetFull",
      m.active, m.merged_into_id AS "mergedIntoId",
      m.created_at AS "createdAt",
      u.name AS "createdByName"
    FROM market m
    LEFT JOIN chain c ON c.id = m.chain_id
    LEFT JOIN "user" u ON u.id = m.created_by_user_id
    ${where}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const totalResult = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM market m ${where}
  `);
  const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);

  return {
    items: result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      gln: r.gln,
      chainName: r.chainName,
      city: r.city,
      postalCode: r.postalCode,
      district: r.district,
      streetFull: r.streetFull,
      active: r.active,
      mergedIntoId: r.mergedIntoId,
      createdAt: new Date(r.createdAt as unknown as string),
      createdByName: r.createdByName,
    })),
    total,
  };
}

// Hilfs-Aktion für UI: Liste aller Ketten
export async function listChains(): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: chainTable.id, name: chainTable.name })
    .from(chainTable)
    .where(eq(chainTable.active, true))
    .orderBy(chainTable.name);
  return rows;
}

// silence unused for cross-tx imports
void noteTable;
void actionTable;
void ne;
void isNull;
