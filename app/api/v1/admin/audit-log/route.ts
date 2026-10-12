// GET /api/v1/admin/audit-log — gefilterte Liste der Audit-Events.
// Filter: event, user_id, from, to. Cursor-Pagination (Offset-basiert).

import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const querySchema = z.object({
  event: z.string().optional(),
  user_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return validationFailed("Ungültige Query");

    const limit = parsed.data.limit ?? 50;
    const offset = parsed.data.offset ?? 0;

    const conditions: ReturnType<typeof sql>[] = [sql`a.company_id = ${admin.companyId}::uuid`];
    if (parsed.data.event) conditions.push(sql`a.event = ${parsed.data.event}`);
    if (parsed.data.user_id) conditions.push(sql`a.user_id = ${parsed.data.user_id}::uuid`);
    if (parsed.data.from) conditions.push(sql`a.created_at >= ${parsed.data.from}::timestamptz`);
    if (parsed.data.to) conditions.push(sql`a.created_at <= ${parsed.data.to}::timestamptz`);

    const where = conditions.length
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const result = await db.execute<{
      id: string;
      event: string;
      payload: Record<string, unknown>;
      created_at: Date;
      user_id: string | null;
      user_name: string | null;
    }>(sql`
      SELECT a.id, a.event, a.payload, a.created_at, a.user_id, u.name AS user_name
      FROM audit_log a
      LEFT JOIN "user" u ON u.id = a.user_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalResult = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM audit_log a ${where}
    `);
    const total = parseInt(totalResult.rows[0]?.count ?? "0", 10);

    // Distinct events für Filter-Dropdown
    const eventsResult = await db.execute<{ event: string }>(sql`
      SELECT DISTINCT event FROM audit_log
      WHERE company_id = ${admin.companyId}::uuid
      ORDER BY event
    `);

    return ok({
      items: result.rows.map((r) => ({
        id: r.id,
        event: r.event,
        payload: r.payload ?? {},
        created_at: r.created_at,
        user: r.user_id ? { id: r.user_id, name: r.user_name } : null,
      })),
      total,
      available_events: eventsResult.rows.map((r) => r.event),
    });
  });
}
