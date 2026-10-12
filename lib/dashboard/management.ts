import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type {
  SalesStage,
  CurrentSolution,
  CustomerSatisfaction,
  FeedbackReason,
  InterestLevel,
} from "@/lib/db/schema";
import {
  getBerlinPeriodBoundaries,
  getBerlinDayBoundaries,
  getBerlinWeekBoundaries,
  calculateOverdueDays,
} from "./date-utils";
import {
  computeConversionRate,
  type ManagementPeriodKey,
  type ManagementDashboardData,
  type ManagementFollowUpItem,
  type ManagementEmployeePerformance,
  type ManagementFeedbackReasonItem,
  type ManagementPipeline,
  type ManagementInterestDistribution,
  type ManagementSolutionDistribution,
  type ManagementSatisfactionDistribution,
} from "./management-types";
import { FEEDBACK_REASON_DISPLAY } from "@/lib/sales/display";

export async function getManagementDashboard(
  companyId: string,
  periodKey: ManagementPeriodKey = "week",
  now = new Date(),
): Promise<ManagementDashboardData> {
  const period = getBerlinPeriodBoundaries(periodKey, now);
  const { startOfToday, endOfToday } = getBerlinDayBoundaries(now);
  const { endOfWeek } = getBerlinWeekBoundaries(now);

  const [
    activityRes,
    followUpStatsRes,
    overdueListRes,
    pipelineRes,
    employeesRes,
    feedbackReasonsRes,
    solutionRes,
    satisfactionRes,
    interestRes,
  ] = await Promise.all([
    // 1. Flow: Aggregierte Aktivitätsmetriken im ausgewählten Zeitraum
    db.execute<{
      contacts: number;
      visits: number;
      phone_calls: number;
      offers: number;
      wins: number;
      losses: number;
      won_sales_value: string | null;
    }>(sql`
      SELECT
        COUNT(*)::int AS contacts,
        COUNT(*) FILTER (
          WHERE a.contact_type = 'visit'
             OR (a.contact_type IS NULL AND a.type IN ('visit', 'profi_visit'))
        )::int AS visits,
        COUNT(*) FILTER (WHERE a.contact_type = 'phone')::int AS phone_calls,
        COUNT(*) FILTER (WHERE a.sales_stage = 'angebot')::int AS offers,
        COUNT(*) FILTER (WHERE a.sales_stage = 'gewonnen')::int AS wins,
        COUNT(*) FILTER (WHERE a.sales_stage = 'verloren')::int AS losses,
        SUM(a.sales_value) FILTER (
          WHERE a.sales_stage = 'gewonnen' AND a.sales_value IS NOT NULL
        )::numeric AS won_sales_value
      FROM action a
      INNER JOIN market m ON m.id = a.market_id
      WHERE m.company_id = ${companyId}::uuid
        AND a.created_at >= ${period.start}
        AND a.created_at <= ${period.end}
    `),

    // 2. Snapshot: Zählung offener Wiedervorlagen (überfällig, heute fällig, diese Woche fällig)
    db.execute<{
      overdue_count: number;
      due_today_count: number;
      due_this_week_count: number;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE fu.due_at < ${startOfToday})::int AS overdue_count,
        COUNT(*) FILTER (WHERE fu.due_at >= ${startOfToday} AND fu.due_at <= ${endOfToday})::int AS due_today_count,
        COUNT(*) FILTER (WHERE fu.due_at >= ${startOfToday} AND fu.due_at <= ${endOfWeek})::int AS due_this_week_count
      FROM follow_up fu
      INNER JOIN market m ON m.id = fu.market_id
      WHERE m.company_id = ${companyId}::uuid
        AND fu.status = 'open'
    `),

    // 3. Snapshot: Top 10 älteste überfällige Wiedervorlagen mit Details
    db.execute<{
      id: string;
      market_id: string;
      market_name: string;
      district: string | null;
      sales_stage: SalesStage;
      due_at: Date;
      assigned_user_id: string | null;
      assigned_user_name: string | null;
    }>(sql`
      SELECT
        fu.id,
        fu.market_id,
        m.name AS market_name,
        m.district,
        m.sales_stage,
        fu.due_at,
        COALESCE(u.id, au.id) AS assigned_user_id,
        COALESCE(u.name, au.name, 'Nicht zugewiesen') AS assigned_user_name
      FROM follow_up fu
      INNER JOIN market m ON m.id = fu.market_id
      LEFT JOIN "user" u ON u.id = fu.user_id
      LEFT JOIN "user" au ON au.id = m.assigned_user_id
      WHERE m.company_id = ${companyId}::uuid
        AND fu.status = 'open'
        AND fu.due_at < ${startOfToday}
      ORDER BY fu.due_at ASC
      LIMIT 10
    `),

    // 4. Snapshot: Unternehmensweite Sales-Pipeline nach Phase
    db.execute<{ sales_stage: SalesStage; count: number }>(sql`
      SELECT
        m.sales_stage,
        COUNT(*)::int AS count
      FROM market m
      WHERE m.company_id = ${companyId}::uuid
        AND m.active = TRUE
        AND m.merged_into_id IS NULL
      GROUP BY m.sales_stage
    `),

    // 5. Teamleistung: Aktive Mitarbeiter mit getrennten Sub-CTEs (keine Zeilen-Multiplikation)
    db.execute<{
      id: string;
      name: string;
      email: string;
      role: "admin" | "field_user";
      assigned_customers: number;
      contacts: number;
      visits: number;
      phone_calls: number;
      wins: number;
      losses: number;
      won_sales_value: string | null;
      overdue_follow_ups: number;
    }>(sql`
      WITH user_assigned AS (
        SELECT
          m.assigned_user_id AS user_id,
          COUNT(*)::int AS assigned_count
        FROM market m
        WHERE m.company_id = ${companyId}::uuid
          AND m.active = TRUE
          AND m.merged_into_id IS NULL
          AND m.assigned_user_id IS NOT NULL
        GROUP BY m.assigned_user_id
      ),
      user_period_activity AS (
        SELECT
          a.user_id,
          COUNT(*)::int AS contacts,
          COUNT(*) FILTER (
            WHERE a.contact_type = 'visit'
               OR (a.contact_type IS NULL AND a.type IN ('visit', 'profi_visit'))
          )::int AS visits,
          COUNT(*) FILTER (WHERE a.contact_type = 'phone')::int AS phone_calls,
          COUNT(*) FILTER (WHERE a.sales_stage = 'gewonnen')::int AS wins,
          COUNT(*) FILTER (WHERE a.sales_stage = 'verloren')::int AS losses,
          SUM(a.sales_value) FILTER (
            WHERE a.sales_stage = 'gewonnen' AND a.sales_value IS NOT NULL
          )::numeric AS won_sales_value
        FROM action a
        INNER JOIN market m ON m.id = a.market_id
        WHERE m.company_id = ${companyId}::uuid
          AND a.created_at >= ${period.start}
          AND a.created_at <= ${period.end}
        GROUP BY a.user_id
      ),
      user_overdue_followups AS (
        SELECT
          fu.user_id,
          COUNT(*)::int AS overdue_count
        FROM follow_up fu
        INNER JOIN market m ON m.id = fu.market_id
        WHERE m.company_id = ${companyId}::uuid
          AND fu.status = 'open'
          AND fu.due_at < ${startOfToday}
        GROUP BY fu.user_id
      )
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        COALESCE(ua.assigned_count, 0) AS assigned_customers,
        COALESCE(upa.contacts, 0) AS contacts,
        COALESCE(upa.visits, 0) AS visits,
        COALESCE(upa.phone_calls, 0) AS phone_calls,
        COALESCE(upa.wins, 0) AS wins,
        COALESCE(upa.losses, 0) AS losses,
        COALESCE(upa.won_sales_value, 0)::numeric AS won_sales_value,
        COALESCE(uof.overdue_count, 0) AS overdue_follow_ups
      FROM "user" u
      LEFT JOIN user_assigned ua ON ua.user_id = u.id
      LEFT JOIN user_period_activity upa ON upa.user_id = u.id
      LEFT JOIN user_overdue_followups uof ON uof.user_id = u.id
      WHERE u.company_id = ${companyId}::uuid
        AND u.active = TRUE
      ORDER BY contacts DESC, u.name ASC
    `),

    // 6. Flow: Häufigste Feedback-Gründe im ausgewählten Zeitraum (strukturiert, ohne PII)
    db.execute<{ feedback_reason: FeedbackReason; count: number }>(sql`
      SELECT
        a.feedback_reason,
        COUNT(*)::int AS count
      FROM action a
      INNER JOIN market m ON m.id = a.market_id
      WHERE m.company_id = ${companyId}::uuid
        AND a.feedback_reason IS NOT NULL
        AND a.created_at >= ${period.start}
        AND a.created_at <= ${period.end}
      GROUP BY a.feedback_reason
      ORDER BY count DESC, a.feedback_reason ASC
    `),

    // 7. Snapshot: Verteilung der aktuellen Zahlungslösungen im Kundenbestand
    db.execute<{ current_solution: CurrentSolution; count: number }>(sql`
      SELECT
        m.current_solution,
        COUNT(*)::int AS count
      FROM market m
      WHERE m.company_id = ${companyId}::uuid
        AND m.active = TRUE
        AND m.merged_into_id IS NULL
      GROUP BY m.current_solution
      ORDER BY count DESC
    `),

    // 8. Snapshot: Kundenzufriedenheit im Kundenbestand
    db.execute<{ satisfaction: CustomerSatisfaction; count: number }>(sql`
      SELECT
        m.satisfaction,
        COUNT(*)::int AS count
      FROM market m
      WHERE m.company_id = ${companyId}::uuid
        AND m.active = TRUE
        AND m.merged_into_id IS NULL
      GROUP BY m.satisfaction
      ORDER BY count DESC
    `),

    // 9. Snapshot: Zuletzt bekannter Kunden-Interessensstand pro Kunde
    db.execute<{ interest_level: InterestLevel; count: number }>(sql`
      WITH latest_interest AS (
        SELECT DISTINCT ON (a.market_id)
          a.market_id,
          a.interest_level
        FROM action a
        INNER JOIN market m ON m.id = a.market_id
        WHERE m.company_id = ${companyId}::uuid
          AND m.active = TRUE
          AND m.merged_into_id IS NULL
          AND a.interest_level IS NOT NULL
        ORDER BY a.market_id, a.created_at DESC
      )
      SELECT
        interest_level,
        COUNT(*)::int AS count
      FROM latest_interest
      GROUP BY interest_level
    `),
  ]);

  // Activity & Conversion
  const actRow = activityRes.rows[0];
  const wins = Number(actRow?.wins ?? 0);
  const losses = Number(actRow?.losses ?? 0);
  const conversionRate = computeConversionRate(wins, losses);
  const wonSalesValue = actRow?.won_sales_value != null ? parseFloat(actRow.won_sales_value) : null;

  const activity = {
    contacts: Number(actRow?.contacts ?? 0),
    visits: Number(actRow?.visits ?? 0),
    phoneCalls: Number(actRow?.phone_calls ?? 0),
    offers: Number(actRow?.offers ?? 0),
    wins,
    losses,
    conversionRate,
  };

  // Follow-ups
  const fuStats = followUpStatsRes.rows[0];
  const overdueItems: ManagementFollowUpItem[] = overdueListRes.rows.map((row) => {
    const d = new Date(row.due_at);
    return {
      id: row.id,
      marketId: row.market_id,
      marketName: row.market_name,
      district: row.district,
      salesStage: row.sales_stage,
      dueAt: d.toISOString(),
      overdueDays: calculateOverdueDays(d, now),
      assignedUserId: row.assigned_user_id,
      assignedUserName: row.assigned_user_name ?? "Nicht zugewiesen",
    };
  });

  const followUps = {
    overdue: Number(fuStats?.overdue_count ?? 0),
    dueToday: Number(fuStats?.due_today_count ?? 0),
    dueThisWeek: Number(fuStats?.due_this_week_count ?? 0),
    overdueItems,
  };

  // Pipeline: Alle 6 Phasen garantiert vorhanden
  const pipeline: ManagementPipeline = {
    neu: 0,
    kontaktiert: 0,
    interesse: 0,
    angebot: 0,
    gewonnen: 0,
    verloren: 0,
  };
  for (const row of pipelineRes.rows) {
    if (row.sales_stage in pipeline) {
      pipeline[row.sales_stage] = Number(row.count);
    }
  }

  // Employees
  const employees: ManagementEmployeePerformance[] = employeesRes.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    assignedCustomers: Number(row.assigned_customers ?? 0),
    contacts: Number(row.contacts ?? 0),
    visits: Number(row.visits ?? 0),
    phoneCalls: Number(row.phone_calls ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    overdueFollowUps: Number(row.overdue_follow_ups ?? 0),
    wonSalesValue: Number(row.won_sales_value ?? 0),
  }));

  // Feedback Reasons
  const feedbackReasons: ManagementFeedbackReasonItem[] = feedbackReasonsRes.rows.map((row) => ({
    reason: row.feedback_reason,
    label: FEEDBACK_REASON_DISPLAY[row.feedback_reason]?.label ?? row.feedback_reason,
    count: Number(row.count),
  }));

  // Current Solution: Alle 7 Ausprägungen garantiert vorhanden
  const solutionDistribution: ManagementSolutionDistribution = {
    keine: 0,
    sumup: 0,
    zettle: 0,
    verifone: 0,
    ingenico: 0,
    andere: 0,
    unbekannt: 0,
  };
  for (const row of solutionRes.rows) {
    if (row.current_solution in solutionDistribution) {
      solutionDistribution[row.current_solution] = Number(row.count);
    }
  }

  // Satisfaction: Alle 4 Ausprägungen garantiert vorhanden
  const satisfactionDistribution: ManagementSatisfactionDistribution = {
    zufrieden: 0,
    neutral: 0,
    unzufrieden: 0,
    unbekannt: 0,
  };
  for (const row of satisfactionRes.rows) {
    if (row.satisfaction in satisfactionDistribution) {
      satisfactionDistribution[row.satisfaction] = Number(row.count);
    }
  }

  // Interest: Alle 4 Ausprägungen garantiert vorhanden
  const interestDistribution: ManagementInterestDistribution = {
    hoch: 0,
    mittel: 0,
    niedrig: 0,
    kein_interesse: 0,
  };
  for (const row of interestRes.rows) {
    if (row.interest_level in interestDistribution) {
      interestDistribution[row.interest_level] = Number(row.count);
    }
  }

  return {
    period: {
      key: period.key,
      label: period.label,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    },
    activity,
    followUps,
    pipeline,
    employees,
    interestDistribution,
    feedbackReasons,
    solutionDistribution,
    satisfactionDistribution,
    wonSalesValue,
  };
}
