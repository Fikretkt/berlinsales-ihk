import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type {
  SalesStage,
  InterestLevel,
  CurrentSolution,
  CustomerSatisfaction,
} from "@/lib/db/schema";
import {
  getBerlinDayBoundaries,
  getBerlinWeekBoundaries,
  formatGermanTodayDate,
  getGreetingSalutation,
  formatFollowUpLabel,
  calculateOverdueDays,
} from "./date-utils";
import type {
  EmployeeTodayDashboardData,
  DashboardFollowUpItem,
  DashboardHighPriorityCustomer,
} from "./types";

export async function getEmployeeTodayDashboard(
  companyId: string,
  userId: string,
  userName = "Vertrieb",
  now = new Date(),
): Promise<EmployeeTodayDashboardData> {
  const { startOfToday, endOfToday } = getBerlinDayBoundaries(now);
  const { startOfWeek, endOfWeek } = getBerlinWeekBoundaries(now);

  // Parallelisierte, performante SQL-Queries (alle companyId- und userId-gescopt)
  const [
    followUpStatsRes,
    followUpRowsRes,
    assignedCountRes,
    pipelineRes,
    weeklyActivityRes,
    highPriorityCountRes,
    highPriorityRowsRes,
  ] = await Promise.all([
    // 1. Genaue Zählung offener Wiedervorlagen (überfällig vs. heute fällig)
    db.execute<{ overdue_count: number; today_count: number }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE fu.due_at < ${startOfToday})::int AS overdue_count,
        COUNT(*) FILTER (WHERE fu.due_at >= ${startOfToday} AND fu.due_at <= ${endOfToday})::int AS today_count
      FROM follow_up fu
      INNER JOIN market m ON m.id = fu.market_id
      WHERE m.company_id = ${companyId}::uuid
        AND fu.status = 'open'
        AND (fu.user_id = ${userId}::uuid OR m.assigned_user_id = ${userId}::uuid)
    `),

    // 2. Details für offene Wiedervorlagen bis einschließlich heute
    db.execute<{
      id: string;
      market_id: string;
      market_name: string;
      district: string | null;
      sales_stage: SalesStage;
      due_at: Date;
    }>(sql`
      SELECT
        fu.id,
        fu.market_id,
        m.name AS market_name,
        m.district,
        m.sales_stage,
        fu.due_at
      FROM follow_up fu
      INNER JOIN market m ON m.id = fu.market_id
      WHERE m.company_id = ${companyId}::uuid
        AND fu.status = 'open'
        AND (fu.user_id = ${userId}::uuid OR m.assigned_user_id = ${userId}::uuid)
        AND fu.due_at <= ${endOfToday}
      ORDER BY fu.due_at ASC
      LIMIT 50
    `),

    // 3. Anzahl mir zugewiesener aktiver Kunden
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM market m
      WHERE m.company_id = ${companyId}::uuid
        AND m.assigned_user_id = ${userId}::uuid
        AND m.active = TRUE
        AND m.merged_into_id IS NULL
    `),

    // 4. Pipeline-Zusammenfassung nach Verkaufsphase
    db.execute<{ sales_stage: SalesStage; count: number }>(sql`
      SELECT
        m.sales_stage,
        COUNT(*)::int AS count
      FROM market m
      WHERE m.company_id = ${companyId}::uuid
        AND m.assigned_user_id = ${userId}::uuid
        AND m.active = TRUE
        AND m.merged_into_id IS NULL
      GROUP BY m.sales_stage
    `),

    // 5. Persönliche Aktivität dieser Kalenderwoche (Mo–So in Berlin)
    db.execute<{
      contacts: number;
      visits: number;
      phone_calls: number;
      emails: number;
      offers: number;
      wins: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS contacts,
        COUNT(*) FILTER (WHERE a.contact_type = 'visit' OR (a.contact_type IS NULL AND a.type IN ('visit', 'profi_visit')))::int AS visits,
        COUNT(*) FILTER (WHERE a.contact_type = 'phone')::int AS phone_calls,
        COUNT(*) FILTER (WHERE a.contact_type = 'email')::int AS emails,
        COUNT(*) FILTER (WHERE a.sales_stage = 'angebot')::int AS offers,
        COUNT(*) FILTER (WHERE a.sales_stage = 'gewonnen')::int AS wins
      FROM action a
      INNER JOIN market m ON m.id = a.market_id
      WHERE m.company_id = ${companyId}::uuid
        AND a.user_id = ${userId}::uuid
        AND a.created_at >= ${startOfWeek}
        AND a.created_at <= ${endOfWeek}
    `),

    // 6. Anzahl Kunden mit hoher Priorität (zugewiesen, nicht no_contact, nicht gewonnen/verloren, letztes Interesse hoch)
    db.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM market m
      LEFT JOIN LATERAL (
        SELECT a.interest_level
        FROM action a
        WHERE a.market_id = m.id
        ORDER BY a.created_at DESC
        LIMIT 1
      ) la ON TRUE
      WHERE m.company_id = ${companyId}::uuid
        AND m.assigned_user_id = ${userId}::uuid
        AND m.active = TRUE
        AND m.merged_into_id IS NULL
        AND m.no_contact = FALSE
        AND m.sales_stage NOT IN ('gewonnen', 'verloren')
        AND la.interest_level = 'hoch'
    `),

    // 7. Liste der Kunden mit hoher Priorität (max. 5)
    db.execute<{
      id: string;
      name: string;
      district: string | null;
      sales_stage: SalesStage;
      current_solution: CurrentSolution;
      satisfaction: CustomerSatisfaction;
      interest_level: InterestLevel | null;
      last_contact_at: Date | null;
      next_follow_up_due_at: Date | null;
    }>(sql`
      SELECT
        m.id,
        m.name,
        m.district,
        m.sales_stage,
        m.current_solution,
        m.satisfaction,
        la.interest_level,
        la.created_at AS last_contact_at,
        nfu.due_at AS next_follow_up_due_at
      FROM market m
      LEFT JOIN LATERAL (
        SELECT a.interest_level, a.created_at
        FROM action a
        WHERE a.market_id = m.id
        ORDER BY a.created_at DESC
        LIMIT 1
      ) la ON TRUE
      LEFT JOIN LATERAL (
        SELECT fu.due_at
        FROM follow_up fu
        WHERE fu.market_id = m.id AND fu.status = 'open'
        ORDER BY fu.due_at ASC
        LIMIT 1
      ) nfu ON TRUE
      WHERE m.company_id = ${companyId}::uuid
        AND m.assigned_user_id = ${userId}::uuid
        AND m.active = TRUE
        AND m.merged_into_id IS NULL
        AND m.no_contact = FALSE
        AND m.sales_stage NOT IN ('gewonnen', 'verloren')
        AND la.interest_level = 'hoch'
      ORDER BY la.created_at DESC NULLS LAST
      LIMIT 5
    `),
  ]);

  // Aufteilung der Wiedervorlagen in überfällig vs. heute fällig
  const overdueFollowUps: DashboardFollowUpItem[] = [];
  const dueTodayFollowUps: DashboardFollowUpItem[] = [];

  for (const row of followUpRowsRes.rows) {
    const d = new Date(row.due_at);
    const labelInfo = formatFollowUpLabel(d, now);
    const overdueDays = labelInfo.isOverdue ? calculateOverdueDays(d, now) : undefined;
    const item: DashboardFollowUpItem = {
      id: row.id,
      marketId: row.market_id,
      marketName: row.market_name,
      district: row.district,
      salesStage: row.sales_stage,
      dueAt: d.toISOString(),
      overdueDays,
      label: labelInfo.label,
    };

    if (labelInfo.isOverdue) {
      overdueFollowUps.push(item);
    } else if (labelInfo.isToday) {
      dueTodayFollowUps.push(item);
    }
  }

  // Pipeline-Objekt mit allen 6 Phasen aufbauen
  const pipeline = {
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

  // High-Priority-Kunden formatieren
  const highPriorityCustomers: DashboardHighPriorityCustomer[] =
    highPriorityRowsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      district: row.district,
      salesStage: row.sales_stage,
      interestLevel: row.interest_level,
      currentSolution: row.current_solution,
      satisfaction: row.satisfaction,
      lastContactAt: row.last_contact_at
        ? new Date(row.last_contact_at).toISOString()
        : null,
      nextFollowUpDueAt: row.next_follow_up_due_at
        ? new Date(row.next_follow_up_due_at).toISOString()
        : null,
    }));

  const activityRow = weeklyActivityRes.rows[0];
  const weeklyActivity = {
    contacts: Number(activityRow?.contacts ?? 0),
    visits: Number(activityRow?.visits ?? 0),
    phoneCalls: Number(activityRow?.phone_calls ?? 0),
    emails: Number(activityRow?.emails ?? 0),
    offers: Number(activityRow?.offers ?? 0),
    wins: Number(activityRow?.wins ?? 0),
  };

  const followUpStats = followUpStatsRes.rows[0];
  const firstName = userName.trim().split(" ")[0] || "Vertrieb";

  return {
    dateFormatted: formatGermanTodayDate(now),
    greeting: {
      salutation: getGreetingSalutation(now),
      userName: firstName,
    },
    summary: {
      overdueFollowUps: Number(followUpStats?.overdue_count ?? 0),
      dueTodayFollowUps: Number(followUpStats?.today_count ?? 0),
      assignedCustomers: Number(assignedCountRes.rows[0]?.count ?? 0),
      highPriorityCustomers: Number(highPriorityCountRes.rows[0]?.count ?? 0),
    },
    overdueFollowUps,
    dueTodayFollowUps,
    pipeline,
    weeklyActivity,
    highPriorityCustomers,
  };
}
