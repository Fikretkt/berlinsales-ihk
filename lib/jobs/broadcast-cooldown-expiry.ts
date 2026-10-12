// Job 2: NOTIFY für Märkte, deren Cooldown gerade abgelaufen ist.
// Informativ: bei Skip einfach Skip, Latenz bis 5 Min OK.
// Läuft alle 5 Minuten.

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifyMarketsBulkUpdated } from "@/lib/sse/notify";

export interface BroadcastCooldownResult {
  count: number;
  marketIds: string[];
  durationMs: number;
}

export async function broadcastCooldownExpiry(
  windowMinutes = 5,
): Promise<BroadcastCooldownResult> {
  const t0 = Date.now();
  // Markt-IDs deren letzte Action einen Cooldown hat, der innerhalb des
  // Zeitfensters abgelaufen ist UND keine neuere Action existiert.
  const result = await db.execute<{ market_id: string }>(sql`
    SELECT DISTINCT a.market_id
    FROM action a
    WHERE a.cooldown_until BETWEEN NOW() - INTERVAL '${sql.raw(String(windowMinutes))} minutes' AND NOW()
      AND NOT EXISTS (
        SELECT 1 FROM action a2
        WHERE a2.market_id = a.market_id AND a2.created_at > a.created_at
      )
  `);
  const marketIds = result.rows.map((r) => r.market_id);
  if (marketIds.length > 0) {
    await notifyMarketsBulkUpdated(marketIds);
  }
  return { count: marketIds.length, marketIds, durationMs: Date.now() - t0 };
}
