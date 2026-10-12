// Reservation-Insert mit Advisory Lock + Status-Check.
// Tagesende-Berechnung via date-fns-tz, damit Sommer/Winterzeit korrekt sind.

import { sql } from "drizzle-orm";
import { endOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { pool, db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { getMarketDetail } from "@/lib/markets/repo";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { notifyMarketUpdated } from "@/lib/sse/notify";

const BERLIN_TZ = "Europe/Berlin";

export function endOfTodayBerlinUtc(now: Date = new Date()): Date {
  // 1. Aktuellen Moment in Berlin-Zeit umrechnen, 2. Tagesende dort bilden,
  // 3. zurück nach UTC.
  const berlinNow = toZonedTime(now, BERLIN_TZ);
  const berlinEnd = endOfDay(berlinNow);
  return fromZonedTime(berlinEnd, BERLIN_TZ);
}

const RESERVABLE_STATUSES = ["gruen", "gelb", "orange", "rosa"] as const;

export interface ReserveResult {
  reservationId: string;
  validUntil: Date;
}

export async function createReservation(
  marketId: string,
  user: SessionUser,
): Promise<ReserveResult> {
  // Markt-Status prüfen (via repo)
  const detail = await getMarketDetail(user.companyId, marketId);
  if (detail.kind === "not_found") {
    throw new HttpError(404, "MARKET_NOT_FOUND", "Markt nicht gefunden");
  }
  if (detail.kind === "merged") {
    throw new HttpError(410, "MARKET_MERGED", "Markt wurde zusammengeführt", {
      merged_into_id: detail.mergedIntoId,
    });
  }
  if (!(RESERVABLE_STATUSES as readonly string[]).includes(detail.market.computedStatus)) {
    throw new HttpError(
      409,
      "RESERVATION_NOT_ALLOWED_FOR_STATUS",
      `Reservierung auf Status "${detail.market.computedStatus}" nicht erlaubt`,
    );
  }

  const validUntil = endOfTodayBerlinUtc();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [marketId]);

    try {
      const res = await client.query<{ id: string }>(
        `INSERT INTO reservation (market_id, user_id, valid_until)
         VALUES ($1, $2, $3) RETURNING id`,
        [marketId, user.id, validUntil],
      );
      await client.query("COMMIT");
      notifyMarketUpdated(marketId, detail.market.computedStatus).catch(() => {});
      return { reservationId: res.rows[0]!.id, validUntil };
    } catch (err) {
      await client.query("ROLLBACK");
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        throw new HttpError(
          409,
          "RESERVATION_EXISTS",
          "Markt ist bereits reserviert",
        );
      }
      throw err;
    }
  } finally {
    client.release();
  }
}

export async function cancelReservation(
  marketId: string,
  user: SessionUser,
): Promise<{ cancelled: boolean }> {
  // Eigene Reservierung: jeder darf. Fremde: nur Admin.
  const rows = await db.execute<{ id: string; user_id: string }>(sql`
    SELECT r.id, r.user_id FROM reservation r
    INNER JOIN market m ON m.id = r.market_id
    WHERE r.market_id = ${marketId}::uuid AND m.company_id = ${user.companyId}::uuid AND r.active = TRUE
    LIMIT 1
  `);
  const r = rows.rows[0];
  if (!r) {
    throw new HttpError(404, "RESERVATION_NOT_FOUND", "Keine aktive Reservierung");
  }
  const isOwn = r.user_id === user.id;
  if (!isOwn && user.role !== "admin") {
    throw new HttpError(
      403,
      "FIELD_USER_NOT_ALLOWED",
      "Nur der Reservierende oder ein Admin darf die Reservierung aufheben",
    );
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE reservation
      SET active = FALSE, cancelled_at = NOW(), cancelled_by_user_id = ${user.id}::uuid
      WHERE id = ${r.id}::uuid
    `);
    if (!isOwn) {
      await tx.insert(auditLog).values({
        companyId: user.companyId,
        userId: user.id,
        event: AUDIT_EVENTS.RESERVATION_CANCELLED_BY_ADMIN,
        payload: { market_id: marketId, reservation_id: r.id, reserved_user_id: r.user_id },
      });
    }
  });

  // NOTIFY: status bleibt gleich, aber Reservation-Info ist weg → Frontend refetcht
  const after = await getMarketDetail(user.companyId, marketId);
  if (after.kind === "ok") {
    notifyMarketUpdated(marketId, after.market.computedStatus).catch(() => {});
  }

  return { cancelled: true };
}
