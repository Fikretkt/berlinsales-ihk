// Rückgängig: löscht die letzte eigene Action innerhalb der 30-Sekunden-Frist.
// Bedingungen:
//   1. Action gehört dem aktierenden User
//   2. Action ist <30s alt
//   3. Es gibt keine spätere Action auf dem Markt
// Audit-Eintrag bleibt: alle Original-Daten in audit_log.payload.
//
// NICHT wiederhergestellt wird die durch die Action aufgehobene Reservierung.
// Wenn der User die wieder will, klickt er auf „Reservieren".

import { sql } from "drizzle-orm";
import { pool, db } from "@/lib/db/client";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { notifyMarketUpdated } from "@/lib/sse/notify";

const UNDO_WINDOW_SECONDS = 30;

export interface UndoResult {
  marketId: string;
  newStatus: string;
}

export async function undoAction(
  actionId: string,
  user: SessionUser,
): Promise<UndoResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Action holen + lock
    const actionRes = await client.query<{
      id: string;
      market_id: string;
      user_id: string;
      type: string;
      result: string | null;
      resulting_status: string;
      cooldown_until: string | null;
      created_at: Date;
      payload: Record<string, unknown>;
    }>(
      `SELECT a.id, a.market_id, a.user_id, a.type, a.result, a.resulting_status,
              a.cooldown_until, a.created_at, a.payload
       FROM action a INNER JOIN market m ON m.id = a.market_id
       WHERE a.id = $1::uuid AND m.company_id = $2::uuid FOR UPDATE`,
      [actionId, user.companyId],
    );

    if (actionRes.rows.length === 0) {
      throw new HttpError(404, "ACTION_NOT_FOUND", "Aktion nicht gefunden");
    }
    const action = actionRes.rows[0]!;

    // 1. Owner-Check
    if (action.user_id !== user.id) {
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Du kannst nur deine eigenen Aktionen zurücknehmen",
      );
    }

    // 2. Alter-Check
    const ageSec = (Date.now() - new Date(action.created_at).getTime()) / 1000;
    if (ageSec > UNDO_WINDOW_SECONDS) {
      throw new HttpError(
        409,
        "UNDO_WINDOW_CLOSED",
        "Das 30-Sekunden-Fenster zum Rückgängig-Machen ist abgelaufen",
      );
    }

    // 3. Keine spätere Action auf dem Markt (eigene Action über id ausschließen,
    //    Mikrosekunden-Präzision von Postgres kann beim Round-Trip verloren gehen).
    const laterRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM action
       WHERE market_id = $1::uuid AND id != $2::uuid AND created_at >= $3`,
      [action.market_id, action.id, action.created_at],
    );
    if (parseInt(laterRes.rows[0]!.count, 10) > 0) {
      throw new HttpError(
        409,
        "LATER_ACTION_EXISTS",
        "Es gibt schon eine weitere Aktion auf dem Markt",
      );
    }

    // 4. Action löschen
    await client.query(`DELETE FROM action WHERE id = $1::uuid`, [actionId]);

    // 5. Audit-Eintrag mit Original-Daten
    await client.query(
      `INSERT INTO audit_log (company_id, user_id, event, payload) VALUES ($1, $2, $3, $4::jsonb)`,
      [
        user.companyId,
        user.id,
        AUDIT_EVENTS.ACTION_UNDONE,
        JSON.stringify({
          original_action_id: action.id,
          market_id: action.market_id,
          type: action.type,
          result: action.result,
          resulting_status: action.resulting_status,
          cooldown_until: action.cooldown_until,
          original_created_at: action.created_at,
          original_payload: action.payload,
        }),
      ],
    );

    await client.query("COMMIT");

    // Neuen Status holen für die Antwort
    const statusRes = await db.execute<{ computed_status: string }>(sql`
      SELECT computed_status FROM v_market_status WHERE market_id = ${action.market_id}::uuid
    `);
    const newStatus = statusRes.rows[0]?.computed_status ?? "gruen";

    // SSE NOTIFY: andere User sollen den Markt neu laden
    notifyMarketUpdated(action.market_id, newStatus).catch(() => {});

    return { marketId: action.market_id, newStatus };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
