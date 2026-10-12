// POST /api/v1/actions/report-conflict — Field User meldet Offline-Konflikt an Admin.
// Idempotent über client_id: zweiter Aufruf gibt gleichen report_id zurück.
// report_id = audit_log.id (kein eigenes Schema, siehe Reference.md)

import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { getMarketDetail } from "@/lib/markets/repo";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const schema = z.object({
  client_id: z.string().uuid(),
  market_id: z.string().uuid(),
  intended_type: z.string(),
  intended_result: z.string().nullish(),
  client_timestamp: z.string().datetime(),
  conflict: z.object({
    expected_statuses: z.array(z.string()).optional(),
    actual_status: z.string().optional(),
    action_type: z.string().optional(),
    code: z.string().optional(),
  }),
  geo_lat: z.number().nullish(),
  geo_lng: z.number().nullish(),
  user_comment: z.string().max(2000).nullish(),
});

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }

    const market = await getMarketDetail(user.companyId, parsed.data.market_id);
    if (market.kind !== "ok") {
      return validationFailed("Markt nicht gefunden", "market_id");
    }

    // Idempotenz-Check: schon gemeldet für diese client_id?
    const existing = await db.execute<{ id: string; created_at: string }>(sql`
      SELECT id, created_at::text FROM audit_log
      WHERE event = 'offline_conflict_reported'
        AND user_id = ${user.id}::uuid AND company_id = ${user.companyId}::uuid
        AND payload->>'client_id' = ${parsed.data.client_id}
      LIMIT 1
    `);
    if (existing.rows.length > 0) {
      return ok({
        report_id: existing.rows[0]!.id,
        received_at: existing.rows[0]!.created_at,
        idempotent: true,
      });
    }

    const res = await db
      .insert(auditLog)
      .values({
        companyId: user.companyId,
        userId: user.id,
        event: AUDIT_EVENTS.OFFLINE_CONFLICT_REPORTED,
        payload: {
          client_id: parsed.data.client_id,
          market_id: parsed.data.market_id,
          intended_type: parsed.data.intended_type,
          intended_result: parsed.data.intended_result ?? null,
          client_timestamp: parsed.data.client_timestamp,
          conflict: parsed.data.conflict,
          geo_lat: parsed.data.geo_lat ?? null,
          geo_lng: parsed.data.geo_lng ?? null,
          user_comment: parsed.data.user_comment ?? null,
        },
      })
      .returning({ id: auditLog.id, createdAt: auditLog.createdAt });

    return ok(
      {
        report_id: res[0]!.id,
        received_at: res[0]!.createdAt,
      },
      201,
    );
  });
}
