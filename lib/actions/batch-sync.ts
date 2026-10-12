// POST /actions/batch-sync — Offline-Sync.
// Idempotent über (user_id, client_id).
// Liefert synced + conflicts (strukturiertes Objekt, kein String-Code).

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { insertAction } from "./insert";
import { getMarketDetail } from "@/lib/markets/repo";
import type { ActionTypeValue, ActionResultValue, MarketStatus } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/http/errors";

const EXPECTED_PREDECESSORS: Record<ActionTypeValue, MarketStatus[]> = {
  visit: ["gruen", "blau"],
  profi_visit: ["rosa"],
  delivery: ["gelb"],
  control: ["orange"],
  cancel_order: ["gelb"],
  manual_override: ["gruen", "gelb", "orange", "rosa", "rot", "grau"], // alles außer blau
};

export interface BatchSyncInput {
  client_id: string;
  market_id: string;
  type: ActionTypeValue;
  result?: ActionResultValue | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  client_timestamp: string;
  payload?: Record<string, unknown>;
}

export interface BatchSyncResponseItem {
  client_id: string;
  action_id?: string;
  new_status?: MarketStatus;
  conflict?:
    | { expected_statuses: string[]; actual_status: string; action_type: string }
    | { code: "MARKET_MERGED"; merged_into_id?: string }
    | { code: "MARKET_INACTIVE" }
    | { code: "USER_DEACTIVATED" }
    | { code: "MARKET_IN_COOLDOWN" }
    | { code: "VALIDATION_FAILED"; message: string };
  current_status?: string;
}

export interface BatchSyncResponse {
  synced: BatchSyncResponseItem[];
  conflicts: BatchSyncResponseItem[];
}

export async function batchSyncActions(
  actions: BatchSyncInput[],
  user: SessionUser,
): Promise<BatchSyncResponse> {
  const synced: BatchSyncResponseItem[] = [];
  const conflicts: BatchSyncResponseItem[] = [];

  for (const a of actions) {
    if (!a.client_id) {
      conflicts.push({
        client_id: a.client_id ?? "",
        conflict: { code: "VALIDATION_FAILED", message: "client_id fehlt" },
      });
      continue;
    }

    // Idempotenz: schon gesynct? → silent success in synced
    const existing = await db.execute<{ id: string; resulting_status: string }>(sql`
      SELECT id, resulting_status FROM action
      WHERE user_id = ${user.id}::uuid AND client_id = ${a.client_id}
      LIMIT 1
    `);
    if (existing.rows.length > 0) {
      synced.push({
        client_id: a.client_id,
        action_id: existing.rows[0]!.id,
        new_status: existing.rows[0]!.resulting_status as MarketStatus,
      });
      continue;
    }

    // Markt-Detail holen für Status + merged/inactive-Check
    const detail = await getMarketDetail(user.companyId, a.market_id);
    if (detail.kind === "merged") {
      conflicts.push({
        client_id: a.client_id,
        conflict: { code: "MARKET_MERGED", merged_into_id: detail.mergedIntoId },
      });
      continue;
    }
    if (detail.kind === "not_found") {
      conflicts.push({
        client_id: a.client_id,
        conflict: { code: "VALIDATION_FAILED", message: "Markt nicht gefunden" },
      });
      continue;
    }
    const market = detail.market;
    if (market.computedStatus === "grau" && a.type !== "manual_override") {
      conflicts.push({
        client_id: a.client_id,
        conflict: { code: "MARKET_INACTIVE" },
        current_status: market.computedStatus,
      });
      continue;
    }

    // Erwarteten Vorgänger-Status prüfen
    const expected = EXPECTED_PREDECESSORS[a.type] ?? [];
    if (!expected.includes(market.computedStatus as MarketStatus)) {
      conflicts.push({
        client_id: a.client_id,
        conflict: {
          expected_statuses: expected,
          actual_status: market.computedStatus,
          action_type: a.type,
        },
        current_status: market.computedStatus,
      });
      continue;
    }

    // Insert mit clientId für Idempotenz-Index
    try {
      const result = await insertAction(
        {
          marketId: a.market_id,
          type: a.type,
          result: a.result ?? null,
          geoLat: a.geo_lat ?? null,
          geoLng: a.geo_lng ?? null,
          clientTimestamp: new Date(a.client_timestamp),
          clientId: a.client_id,
          payload: a.payload,
        },
        user,
      );
      synced.push({
        client_id: a.client_id,
        action_id: result.actionId,
        new_status: result.newStatus,
      });
    } catch (err) {
      const e = err as { code?: string; status?: number };
      if (e.code === "USER_DEACTIVATED") {
        conflicts.push({
          client_id: a.client_id,
          conflict: { code: "USER_DEACTIVATED" },
        });
      } else if (e.code === "MARKET_IN_COOLDOWN") {
        conflicts.push({
          client_id: a.client_id,
          conflict: { code: "MARKET_IN_COOLDOWN" },
          current_status: market.computedStatus,
        });
      } else if (e.code === "DUPLICATE_CLIENT_ID") {
        // Race: zwischen Idempotenz-Check und Insert eingefügt → als synced behandeln
        const after = await db.execute<{ id: string; resulting_status: string }>(sql`
          SELECT id, resulting_status FROM action
          WHERE user_id = ${user.id}::uuid AND client_id = ${a.client_id}
          LIMIT 1
        `);
        if (after.rows[0]) {
          synced.push({
            client_id: a.client_id,
            action_id: after.rows[0].id,
            new_status: after.rows[0].resulting_status as MarketStatus,
          });
        }
      } else {
        conflicts.push({
          client_id: a.client_id,
          conflict: {
            code: "VALIDATION_FAILED",
            message: (err as Error).message ?? "Unbekannter Fehler",
          },
        });
      }
    }
  }

  return { synced, conflicts };
}
