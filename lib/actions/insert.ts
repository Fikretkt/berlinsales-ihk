import { sql } from "drizzle-orm";
import { db, pool } from "@/lib/db/client";
import { market as marketTable } from "@/lib/db/schema";
import { computeResultingStatus } from "@/lib/status/compute";
import { getCooldownUntil } from "@/lib/status/cooldown";
import { haversineMeters, GEO_WARNING_THRESHOLD_M } from "@/lib/geo/distance";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { notifyMarketUpdated } from "@/lib/sse/notify";
import { calculateFollowUpDueAt } from "@/lib/sales/follow-up";
import type {
  ActionTypeValue,
  ActionResultValue,
  MarketStatus,
  SalesStage,
  InterestLevel,
  FeedbackReason,
} from "@/lib/db/schema";
import type { FollowUpType } from "@/lib/sales/types";

export type ContactType = "visit" | "phone" | "email" | "other";

export interface ActionInsertInput {
  marketId: string;
  type: ActionTypeValue;
  result?: ActionResultValue | null;
  geoLat?: number | null;
  geoLng?: number | null;
  clientTimestamp?: Date | null;
  clientId?: string | null;
  payload?: Record<string, unknown>;
  contactType?: ContactType | null;
  note?: string | null;
  interestLevel?: InterestLevel | null;
  feedbackReason?: FeedbackReason | null;
  salesStage?: SalesStage | null;
  salesValue?: number | null;
  followUpType?: FollowUpType | null;
  followUpDueAt?: Date | string | null;
}

export interface ActionInsertResult {
  actionId: string;
  newStatus: MarketStatus;
  cooldownUntil: Date | null;
  distanceMeters: number | null;
  distanceWarning: boolean;
  salesStage?: SalesStage;
  followUpDueAt?: Date | null;
  noContact?: boolean;
}

// =============================================================================
// Postgres → HTTP Mapping (laut Reference.md)
// =============================================================================
function mapPostgresError(err: unknown): HttpError | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { code?: string; message?: string };
  switch (e.code) {
    case "P0001":
      return new HttpError(
        409,
        "MARKET_HAS_ACTIVE_VORGANG",
        "Markt hat einen aktiven Vorgang",
      );
    case "P0002":
      return new HttpError(409, "MARKET_IN_COOLDOWN", "Markt ist im Cooldown");
    case "P0003":
      return new HttpError(409, "MARKET_MERGED", "Markt wurde zusammengeführt");
    case "P0004":
      return new HttpError(409, "MARKET_INACTIVE", "Markt ist inaktiv");
    case "P0005":
      return new HttpError(
        409,
        "MARKET_GREEN_INVALID_ACTION",
        "Auf grünen Märkten ist nur ein Besuch erlaubt",
      );
    case "P0006":
      return new HttpError(409, "USER_DEACTIVATED", "User ist nicht aktiv");
    case "23505":
      // Unique violation — bei Action ist das client_id-Doppel
      return new HttpError(
        409,
        "DUPLICATE_CLIENT_ID",
        "Diese Aktion wurde bereits synchronisiert",
      );
    default:
      return null;
  }
}

export async function insertAction(
  input: ActionInsertInput,
  user: SessionUser,
): Promise<ActionInsertResult> {
  if (
    input.contactType != null &&
    !(["visit", "phone", "email", "other"] as const).includes(input.contactType)
  ) {
    throw new HttpError(400, "VALIDATION_FAILED", "Ungültiger Kontakttyp");
  }
  const interactionNote = input.note?.trim() ?? "";
  if (interactionNote.length > 1000) {
    throw new HttpError(400, "VALIDATION_FAILED", "Notiz ist zu lang (max. 1000 Zeichen)");
  }
  // Field-User: kein manual_override erlaubt (Spec).
  if (input.type === "manual_override" && user.role !== "admin") {
    throw new HttpError(
      403,
      "FIELD_USER_NOT_ALLOWED",
      "manual_override ist nur Admins erlaubt",
    );
  }

  // payload.target_status validieren (für manual_override)
  const targetStatus = (input.payload?.target_status as string | undefined) ?? null;

  // Markt-Koordinaten & Stammdaten holen für Distanz- & Validierungsprüfung
  const marketRows = await db
    .select({
      id: marketTable.id,
      lat: marketTable.lat,
      lng: marketTable.lng,
      mergedIntoId: marketTable.mergedIntoId,
      noContact: marketTable.noContact,
      salesStage: marketTable.salesStage,
      salesValue: marketTable.salesValue,
    })
    .from(marketTable)
    .where(sql`${marketTable.id} = ${input.marketId}::uuid AND ${marketTable.companyId} = ${user.companyId}::uuid`)
    .limit(1);

  if (marketRows.length === 0) {
    throw new HttpError(404, "MARKET_NOT_FOUND", "Markt nicht gefunden");
  }
  const currentMarket = marketRows[0]!;
  if (currentMarket.mergedIntoId) {
    throw new HttpError(409, "MARKET_MERGED", "Markt wurde zusammengeführt");
  }

  // Wenn der Markt bereits als "Nie wieder kontaktieren" markiert ist und ein Follow-Up versucht wird:
  if (
    currentMarket.noContact &&
    input.followUpType &&
    input.followUpType !== "none" &&
    input.followUpType !== "never_contact"
  ) {
    throw new HttpError(
      400,
      "MARKET_NO_CONTACT",
      "Kunde ist als 'Nie wieder kontaktieren' markiert. Keine Wiedervorlage möglich.",
    );
  }

  // Distanz berechnen (immer Backend, Client-Werte werden ignoriert)
  let distanceMeters: number | null = null;
  let distanceWarning = false;
  if (
    input.geoLat != null &&
    input.geoLng != null &&
    currentMarket.lat != null &&
    currentMarket.lng != null
  ) {
    distanceMeters = haversineMeters(
      input.geoLat,
      input.geoLng,
      parseFloat(currentMarket.lat),
      parseFloat(currentMarket.lng),
    );
    distanceWarning = distanceMeters > GEO_WARNING_THRESHOLD_M;
  }

  // resulting_status berechnen (TypeScript, einzige Implementierung)
  const resultingStatus = computeResultingStatus(
    input.type,
    input.result ?? null,
    targetStatus,
  );

  // cooldown_until aus aktueller Regel berechnen (Snapshot)
  const cooldownUntil =
    input.type === "manual_override"
      ? null
      : await getCooldownUntil(input.type, input.result ?? null, db);

  // Insert mit Advisory Lock im selben Client (gleicher Hash wie Trigger)
  const client = await pool.connect();
  let computedFollowUpDueAt: Date | null = null;
  let isNoContact = currentMarket.noContact;
  const finalSalesStage = input.salesStage ?? currentMarket.salesStage;

  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [
      input.marketId,
    ]);

    // 1. Wiedervorlage / No-Contact behandeln
    if (input.followUpType === "never_contact") {
      isNoContact = true;
      await client.query(
        `UPDATE market
         SET no_contact = TRUE, no_contact_at = NOW(), no_contact_set_by_user_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [user.id, input.marketId],
      );
      // Bestehende offene Wiedervorlagen stornieren
      await client.query(
        `UPDATE follow_up
         SET status = 'cancelled', cancelled_at = NOW()
         WHERE market_id = $1 AND status = 'open'`,
        [input.marketId],
      );
      await client.query(
        `INSERT INTO audit_log (company_id, user_id, event, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          user.companyId,
          user.id,
          AUDIT_EVENTS.MARKET_NO_CONTACT_SET,
          JSON.stringify({ market_id: input.marketId }),
        ],
      );
    } else if (
      input.followUpType &&
      ["1w", "1m", "3m", "custom"].includes(input.followUpType)
    ) {
      computedFollowUpDueAt = calculateFollowUpDueAt(
        input.followUpType,
        input.followUpDueAt,
      );
      if (!computedFollowUpDueAt) {
        throw new HttpError(
          400,
          "VALIDATION_FAILED",
          "Ungültiges Fälligkeitsdatum für Wiedervorlage",
        );
      }
    }

    // 2. Sales Pipeline / Stage-Update
    if (input.salesStage && input.salesStage !== currentMarket.salesStage) {
      const salesValueNum =
        input.salesStage === "gewonnen" && input.salesValue != null
          ? input.salesValue
          : null;

      await client.query(
        `UPDATE market
         SET sales_stage = $1, sales_value = $2, updated_at = NOW()
         WHERE id = $3`,
        [input.salesStage, salesValueNum, input.marketId],
      );

      await client.query(
        `INSERT INTO audit_log (company_id, user_id, event, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          user.companyId,
          user.id,
          AUDIT_EVENTS.SALES_STAGE_CHANGED,
          JSON.stringify({
            market_id: input.marketId,
            from_stage: currentMarket.salesStage,
            to_stage: input.salesStage,
            sales_value: salesValueNum,
          }),
        ],
      );
    } else if (
      input.salesStage === "gewonnen" &&
      input.salesValue != null &&
      String(input.salesValue) !== String(currentMarket.salesValue)
    ) {
      await client.query(
        `UPDATE market SET sales_value = $1, updated_at = NOW() WHERE id = $2`,
        [input.salesValue, input.marketId],
      );
    }

    // 3. Action einfügen (inkl. Structured Feedback & Sales Details)
    const result = await client.query<{ id: string }>(
      `INSERT INTO action (
         market_id, user_id, type, contact_type, result, resulting_status,
         interest_level, feedback_reason, sales_stage, sales_value,
         cooldown_until, geo_lat, geo_lng, distance_to_market_meters,
         client_timestamp, client_id, offline_recorded, payload
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16, $17, $18::jsonb
       )
       RETURNING id`,
      [
        input.marketId,
        user.id,
        input.type,
        input.contactType ?? null,
        input.result ?? null,
        resultingStatus,
        input.interestLevel ?? null,
        input.feedbackReason ?? null,
        input.salesStage ?? null,
        input.salesStage === "gewonnen" && input.salesValue != null
          ? input.salesValue
          : null,
        cooldownUntil,
        input.geoLat ?? null,
        input.geoLng ?? null,
        distanceMeters,
        input.clientTimestamp ?? null,
        input.clientId ?? null,
        !!input.clientId,
        JSON.stringify(input.payload ?? {}),
      ],
    );

    const actionId = result.rows[0]!.id;

    // 4. Wiedervorlage anlegen (falls Fälligkeitsdatum berechnet)
    if (computedFollowUpDueAt) {
      // Bestehende offene Wiedervorlagen dieses Kunden stornieren (One-Active-Rule)
      await client.query(
        `UPDATE follow_up
         SET status = 'cancelled', cancelled_at = NOW()
         WHERE market_id = $1 AND status = 'open'`,
        [input.marketId],
      );

      // Neue Wiedervorlage anlegen
      await client.query(
        `INSERT INTO follow_up (
           market_id, user_id, action_id, due_at, status, created_by_user_id
         ) VALUES ($1, $2, $3, $4, 'open', $5)`,
        [
          input.marketId,
          user.id,
          actionId,
          computedFollowUpDueAt,
          user.id,
        ],
      );

      await client.query(
        `INSERT INTO audit_log (company_id, user_id, event, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          user.companyId,
          user.id,
          AUDIT_EVENTS.FOLLOW_UP_CREATED,
          JSON.stringify({
            market_id: input.marketId,
            action_id: actionId,
            due_at: computedFollowUpDueAt.toISOString(),
            follow_up_type: input.followUpType,
          }),
        ],
      );
    }

    // 5. Notiz speichern
    if (interactionNote) {
      await client.query(
        `INSERT INTO note (market_id, action_id, user_id, content)
         VALUES ($1, $2, $3, $4)`,
        [input.marketId, actionId, user.id, interactionNote],
      );
    }

    // 6. Audit-Log für Kontakt
    if (input.contactType) {
      await client.query(
        `INSERT INTO audit_log (company_id, user_id, event, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          user.companyId,
          user.id,
          AUDIT_EVENTS.FIELD_INTERACTION_RECORDED,
          JSON.stringify({
            market_id: input.marketId,
            action_id: actionId,
            contact_type: input.contactType,
            result: input.result ?? null,
            interest_level: input.interestLevel ?? null,
            feedback_reason: input.feedbackReason ?? null,
            sales_stage: input.salesStage ?? null,
            sales_value: input.salesStage === "gewonnen" ? input.salesValue ?? null : null,
            follow_up_type: input.followUpType ?? null,
            follow_up_due_at: computedFollowUpDueAt?.toISOString() ?? null,
            has_note: Boolean(interactionNote),
          }),
        ],
      );
    }

    if (input.type === "manual_override") {
      await client.query(
        `INSERT INTO audit_log (company_id, user_id, event, payload) VALUES ($1, $2, $3, $4::jsonb)`,
        [
          user.companyId,
          user.id,
          AUDIT_EVENTS.MANUAL_OVERRIDE_PERFORMED,
          JSON.stringify({
            market_id: input.marketId,
            target_status: targetStatus,
            reason: input.payload?.reason ?? null,
            action_id: actionId,
          }),
        ],
      );
    }

    // Reservation des Aktierenden auto-aufheben (außer bei manual_override).
    if (input.type !== "manual_override") {
      await client.query(
        `UPDATE reservation
         SET active = FALSE, cancelled_at = NOW(), cancelled_by_user_id = $1
         WHERE market_id = $2 AND user_id = $1 AND active = TRUE`,
        [user.id, input.marketId],
      );
    }

    await client.query("COMMIT");

    // NOTIFY nach commit
    notifyMarketUpdated(input.marketId, resultingStatus).catch(() => {});

    return {
      actionId,
      newStatus: resultingStatus,
      cooldownUntil,
      distanceMeters,
      distanceWarning,
      salesStage: finalSalesStage,
      followUpDueAt: computedFollowUpDueAt,
      noContact: isNoContact,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const mapped = mapPostgresError(err);
    if (mapped) throw mapped;
    throw err;
  } finally {
    client.release();
  }
}
