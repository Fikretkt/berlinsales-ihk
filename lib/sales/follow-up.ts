import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { SalesStage, FeedbackReason } from "@/lib/db/schema";

export {
  calculateFollowUpDueAt,
  isOverdue,
  categorizeFollowUp,
  CATEGORY_LABELS,
  type FollowUpCategory,
} from "./follow-up-utils";

// =============================================================================
// QUERY-HELPERS FÜR DASHBOARD-FOUNDATION (Sprints 007 & 008)
// =============================================================================

export interface FollowUpStats {
  overdue: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  later: number;
  totalOpen: number;
}

export async function getFollowUpStats(
  companyId: string,
  userId?: string,
): Promise<FollowUpStats> {
  const userFilter = userId ? sql`AND fu.user_id = ${userId}::uuid` : sql``;

  const result = await db.execute<{
    overdue: string;
    today: string;
    this_week: string;
    this_month: string;
    later: string;
    total_open: string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE fu.due_at < DATE_TRUNC('day', NOW())
      ) AS overdue,
      COUNT(*) FILTER (
        WHERE fu.due_at >= DATE_TRUNC('day', NOW())
          AND fu.due_at < DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
      ) AS today,
      COUNT(*) FILTER (
        WHERE fu.due_at >= DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
          AND fu.due_at < DATE_TRUNC('week', NOW()) + INTERVAL '1 week'
      ) AS this_week,
      COUNT(*) FILTER (
        WHERE fu.due_at >= DATE_TRUNC('week', NOW()) + INTERVAL '1 week'
          AND fu.due_at < DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
      ) AS this_month,
      COUNT(*) FILTER (
        WHERE fu.due_at >= DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
      ) AS later,
      COUNT(*) AS total_open
    FROM follow_up fu
    INNER JOIN market m ON m.id = fu.market_id
    WHERE m.company_id = ${companyId}::uuid
      AND fu.status = 'open'
      ${userFilter}
  `);

  const row = result.rows[0];
  return {
    overdue: parseInt(row?.overdue ?? "0", 10),
    today: parseInt(row?.today ?? "0", 10),
    thisWeek: parseInt(row?.this_week ?? "0", 10),
    thisMonth: parseInt(row?.this_month ?? "0", 10),
    later: parseInt(row?.later ?? "0", 10),
    totalOpen: parseInt(row?.total_open ?? "0", 10),
  };
}

export interface SalesStageCount {
  stage: SalesStage;
  count: number;
}

export async function getSalesStageStats(
  companyId: string,
): Promise<Record<SalesStage, number>> {
  const result = await db.execute<{ sales_stage: SalesStage; count: string }>(sql`
    SELECT sales_stage, COUNT(*)::text AS count
    FROM market
    WHERE company_id = ${companyId}::uuid AND active = TRUE AND merged_into_id IS NULL
    GROUP BY sales_stage
  `);

  const stats: Record<SalesStage, number> = {
    neu: 0,
    kontaktiert: 0,
    interesse: 0,
    angebot: 0,
    gewonnen: 0,
    verloren: 0,
  };

  for (const row of result.rows) {
    if (row.sales_stage in stats) {
      stats[row.sales_stage] = parseInt(row.count, 10);
    }
  }

  return stats;
}

export async function getFeedbackReasonStats(
  companyId: string,
): Promise<Record<FeedbackReason, number>> {
  const result = await db.execute<{ feedback_reason: FeedbackReason; count: string }>(sql`
    SELECT a.feedback_reason, COUNT(*)::text AS count
    FROM action a
    INNER JOIN market m ON m.id = a.market_id
    WHERE m.company_id = ${companyId}::uuid AND a.feedback_reason IS NOT NULL
    GROUP BY a.feedback_reason
  `);

  const stats: Record<FeedbackReason, number> = {
    preis: 0,
    andere_loesung: 0,
    keine_zeit: 0,
    entscheider_nicht_da: 0,
    kein_bedarf: 0,
    spaeter_kontaktieren: 0,
    sonstiges: 0,
  };

  for (const row of result.rows) {
    if (row.feedback_reason in stats) {
      stats[row.feedback_reason] = parseInt(row.count, 10);
    }
  }

  return stats;
}
