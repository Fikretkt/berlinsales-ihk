// GET /api/v1/admin/conflict-reports — Liste der Konflikt-Berichte.

import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";

const schema = z.object({
  resolved: z.enum(["true", "false", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const parsed = schema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const resolved = parsed.success ? parsed.data.resolved ?? "false" : "false";
    const limit = parsed.success ? parsed.data.limit ?? 50 : 50;

    const resolvedFilter =
      resolved === "true"
        ? sql`AND EXISTS (
            SELECT 1 FROM audit_log r
            WHERE r.event = 'offline_conflict_resolved' AND r.company_id = ${admin.companyId}::uuid
              AND r.payload->>'linked_report_id' = a.id::text
          )`
        : resolved === "false"
        ? sql`AND NOT EXISTS (
            SELECT 1 FROM audit_log r
            WHERE r.event = 'offline_conflict_resolved' AND r.company_id = ${admin.companyId}::uuid
              AND r.payload->>'linked_report_id' = a.id::text
          )`
        : sql``;

    const result = await db.execute<{
      report_id: string;
      created_at: string;
      market_id: string;
      market_name: string;
      reporter_id: string;
      reporter_name: string;
      intended_type: string;
      conflict: Record<string, unknown>;
      client_timestamp: string;
      user_comment: string | null;
      resolved_action_id: string | null;
      resolved_at: string | null;
      resolution_note: string | null;
    }>(sql`
      SELECT
        a.id AS report_id,
        a.created_at::text AS created_at,
        a.payload->>'market_id' AS market_id,
        m.name AS market_name,
        a.user_id AS reporter_id,
        u.name AS reporter_name,
        a.payload->>'intended_type' AS intended_type,
        a.payload->'conflict' AS conflict,
        a.payload->>'client_timestamp' AS client_timestamp,
        a.payload->>'user_comment' AS user_comment,
        (SELECT r.payload->>'linked_action_id' FROM audit_log r
          WHERE r.event = 'offline_conflict_resolved' AND r.company_id = ${admin.companyId}::uuid
            AND r.payload->>'linked_report_id' = a.id::text
          ORDER BY r.created_at DESC LIMIT 1
        ) AS resolved_action_id,
        (SELECT r.created_at::text FROM audit_log r
          WHERE r.event = 'offline_conflict_resolved' AND r.company_id = ${admin.companyId}::uuid
            AND r.payload->>'linked_report_id' = a.id::text
          ORDER BY r.created_at DESC LIMIT 1
        ) AS resolved_at,
        (SELECT r.payload->>'resolution_note' FROM audit_log r
          WHERE r.event = 'offline_conflict_resolved' AND r.company_id = ${admin.companyId}::uuid
            AND r.payload->>'linked_report_id' = a.id::text
          ORDER BY r.created_at DESC LIMIT 1
        ) AS resolution_note
      FROM audit_log a
      LEFT JOIN "user" u ON u.id = a.user_id
      LEFT JOIN market m ON m.id = (a.payload->>'market_id')::uuid
        AND m.company_id = ${admin.companyId}::uuid
      WHERE a.event = 'offline_conflict_reported' AND a.company_id = ${admin.companyId}::uuid
      ${resolvedFilter}
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `);

    return ok({
      items: result.rows.map((r) => ({
        report_id: r.report_id,
        created_at: r.created_at,
        market: { id: r.market_id, name: r.market_name },
        reporter: { user_id: r.reporter_id, name: r.reporter_name },
        intended_type: r.intended_type,
        conflict: r.conflict,
        client_timestamp: r.client_timestamp,
        user_comment: r.user_comment,
        resolved: !!r.resolved_action_id || !!r.resolved_at,
        resolved_action_id: r.resolved_action_id,
        resolved_at: r.resolved_at,
        resolution_note: r.resolution_note,
      })),
    });
  });
}
