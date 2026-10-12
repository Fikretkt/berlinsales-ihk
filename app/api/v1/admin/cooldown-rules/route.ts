// GET /api/v1/admin/cooldown-rules — Liste aller Regeln

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";

export async function GET() {
  return withErrorHandler(async () => {
    await requireAdmin();
    const result = await db.execute<{
      id: string;
      action_type: string;
      result: string | null;
      duration_days: number;
      updated_at: string;
    }>(sql`
      SELECT id, action_type, result, duration_days, updated_at
      FROM cooldown_rule
      ORDER BY action_type, result NULLS FIRST
    `);
    return ok({
      items: result.rows.map((r) => ({
        id: r.id,
        action_type: r.action_type,
        result: r.result,
        duration_days: r.duration_days,
        updated_at: r.updated_at,
      })),
    });
  });
}
