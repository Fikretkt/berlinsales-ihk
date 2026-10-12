// Admin-Dashboard: Was hat jeder Mitarbeiter heute gemacht?
// Tag = Berlin-Zeit ab 00:00 lokal.

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";

type Breakdown = {
  visit_success: number;
  visit_escalation: number;
  visit_declined: number;
  visit_no_contact: number;
  profi_visit_success: number;
  profi_visit_declined: number;
  delivery: number;
  control_ok: number;
  control_problem: number;
  cancel_order: number;
  manual_override: number;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "field_user";
  last_active_at: string | null;
  actions_total: number;
  breakdown: Breakdown;
  markets_touched: number;
};

export async function GET() {
  return withErrorHandler(async () => {
    const me = await requireAdmin();

    // Berlin-Tagesstart in UTC umrechnen (Postgres macht das)
    const rows = (await db.execute(sql`
      WITH today_bounds AS (
        SELECT
          (date_trunc('day', NOW() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin') AS day_start,
          (date_trunc('day', NOW() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' + INTERVAL '1 day') AS day_end
      ),
      acts AS (
        SELECT a.*
        FROM "action" a
        INNER JOIN market m ON m.id = a.market_id, today_bounds t
        WHERE m.company_id = ${me.companyId}::uuid
          AND a.created_at >= t.day_start AND a.created_at < t.day_end
      )
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        MAX(a.created_at)::text AS last_active_at,
        COUNT(a.id)::int AS actions_total,
        COUNT(DISTINCT a.market_id)::int AS markets_touched,
        jsonb_build_object(
          'visit_success',         COUNT(*) FILTER (WHERE a.type = 'visit' AND a.result = 'success'),
          'visit_escalation',      COUNT(*) FILTER (WHERE a.type = 'visit' AND a.result = 'escalation'),
          'visit_declined',        COUNT(*) FILTER (WHERE a.type = 'visit' AND a.result = 'declined'),
          'visit_no_contact',      COUNT(*) FILTER (WHERE a.type = 'visit' AND a.result = 'no_contact'),
          'profi_visit_success',   COUNT(*) FILTER (WHERE a.type = 'profi_visit' AND a.result = 'success'),
          'profi_visit_declined',  COUNT(*) FILTER (WHERE a.type = 'profi_visit' AND a.result = 'declined'),
          'delivery',              COUNT(*) FILTER (WHERE a.type = 'delivery'),
          'control_ok',            COUNT(*) FILTER (WHERE a.type = 'control' AND a.result = 'ok'),
          'control_problem',       COUNT(*) FILTER (WHERE a.type = 'control' AND a.result = 'problem'),
          'cancel_order',          COUNT(*) FILTER (WHERE a.type = 'cancel_order'),
          'manual_override',       COUNT(*) FILTER (WHERE a.type = 'manual_override')
        ) AS breakdown
      FROM "user" u
      LEFT JOIN acts a ON a.user_id = u.id
      WHERE u.company_id = ${me.companyId}
        AND u.active = TRUE
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY actions_total DESC, u.name ASC
    `)).rows as unknown as UserRow[];

    // Recent activity feed (last 20 actions today, all users)
    const feedRows = (await db.execute(sql`
      WITH today_bounds AS (
        SELECT
          (date_trunc('day', NOW() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin') AS day_start,
          (date_trunc('day', NOW() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin' + INTERVAL '1 day') AS day_end
      )
      SELECT
        a.id,
        a.created_at::text AS created_at,
        a.type::text AS type,
        a.result::text AS result,
        a.resulting_status::text AS resulting_status,
        u.name AS user_name,
        m.id AS market_id,
        m.name AS market_name,
        m.city AS market_city
      FROM "action" a
      JOIN "user" u ON u.id = a.user_id
      JOIN market m ON m.id = a.market_id
      , today_bounds t
      WHERE a.created_at >= t.day_start AND a.created_at < t.day_end
        AND m.company_id = ${me.companyId}::uuid
        AND u.company_id = ${me.companyId}
      ORDER BY a.created_at DESC
      LIMIT 20
    `)).rows;

    const totals = {
      actions: rows.reduce((sum, r) => sum + r.actions_total, 0),
      activeUsers: rows.filter((r) => r.actions_total > 0).length,
      totalUsers: rows.length,
    };

    return ok({
      users: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        lastActiveAt: r.last_active_at,
        actionsTotal: r.actions_total,
        marketsTouched: r.markets_touched,
        breakdown: r.breakdown,
      })),
      feed: feedRows.map((r: Record<string, unknown>) => ({
        id: r.id,
        createdAt: r.created_at,
        type: r.type,
        result: r.result,
        resultingStatus: r.resulting_status,
        userName: r.user_name,
        marketId: r.market_id,
        marketName: r.market_name,
        marketCity: r.market_city,
      })),
      totals,
    });
  });
}
