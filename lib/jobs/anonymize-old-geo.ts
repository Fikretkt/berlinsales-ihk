// Job 3: Geo-Anonymisierung nach 90 Tagen (DSGVO).
// Setzt geo_lat, geo_lng, distance_to_market_meters auf NULL.
// Idempotent über geo_anonymized_at IS NULL.

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { AUDIT_EVENTS } from "@/lib/audit/events";

export interface AnonymizeResult {
  count: number;
  durationMs: number;
}

export async function anonymizeOldGeo(): Promise<AnonymizeResult> {
  const t0 = Date.now();
  const result = await db.execute<{ id: string }>(sql`
    UPDATE action
    SET geo_lat = NULL, geo_lng = NULL, distance_to_market_meters = NULL,
        geo_anonymized_at = NOW()
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND geo_anonymized_at IS NULL
      AND (geo_lat IS NOT NULL OR geo_lng IS NOT NULL)
    RETURNING id
  `);
  const count = result.rows.length;
  if (count > 0) {
    await db.insert(auditLog).values({
      userId: null,
      event: AUDIT_EVENTS.GEO_ANONYMIZATION_RUN,
      payload: { count, run_at: new Date().toISOString() },
    });
  }
  return { count, durationMs: Date.now() - t0 };
}
