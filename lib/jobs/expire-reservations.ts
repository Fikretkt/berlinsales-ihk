// Job 1: Abgelaufene Reservierungen deaktivieren + Bulk-NOTIFY senden.
// Idempotent: filter auf active=true AND valid_until <= NOW.
// Läuft jede Minute.

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifyMarketsBulkUpdated } from "@/lib/sse/notify";

export interface ExpireReservationsResult {
  count: number;
  marketIds: string[];
  durationMs: number;
}

export async function expireReservations(): Promise<ExpireReservationsResult> {
  const t0 = Date.now();
  const result = await db.execute<{ market_id: string }>(sql`
    UPDATE reservation
    SET active = FALSE, cancelled_at = NOW()
    WHERE active = TRUE AND valid_until <= NOW()
    RETURNING market_id
  `);
  const marketIds = result.rows.map((r) => r.market_id);
  if (marketIds.length > 0) {
    await notifyMarketsBulkUpdated(marketIds);
  }
  return {
    count: marketIds.length,
    marketIds,
    durationMs: Date.now() - t0,
  };
}
