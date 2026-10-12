// Aktions-Historie pro Markt (letzte N).

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface ActionHistoryItem {
  id: string;
  type: string;
  contactType: string | null;
  result: string | null;
  resultingStatus: string;
  cooldownUntil: Date | null;
  interestLevel: string | null;
  feedbackReason: string | null;
  salesStage: string | null;
  salesValue: number | null;
  followUpDueAt: Date | null;
  userId: string;
  userName: string;
  createdAt: Date;
  payload: Record<string, unknown>;
  offlineRecorded: boolean;
  note: string | null;
}

export async function listMarketHistory(
  companyId: string,
  marketId: string,
  limit = 20,
): Promise<ActionHistoryItem[]> {
  const result = await db.execute<{
    id: string;
    type: string;
    contact_type: string | null;
    result: string | null;
    resulting_status: string;
    cooldown_until: Date | null;
    interest_level: string | null;
    feedback_reason: string | null;
    sales_stage: string | null;
    sales_value: string | null;
    follow_up_due_at: Date | null;
    user_id: string;
    user_name: string;
    created_at: Date;
    payload: Record<string, unknown>;
    offline_recorded: boolean;
    note_content: string | null;
  }>(sql`
    SELECT
      a.id, a.type, a.contact_type, a.result, a.resulting_status, a.cooldown_until,
      a.interest_level, a.feedback_reason, a.sales_stage, a.sales_value::text AS sales_value,
      a.user_id, u.name AS user_name, a.created_at,
      a.payload, a.offline_recorded, n.content AS note_content,
      fu.due_at AS follow_up_due_at
    FROM action a
    INNER JOIN "user" u ON u.id = a.user_id
    INNER JOIN market m ON m.id = a.market_id
    LEFT JOIN note n ON n.action_id = a.id
    LEFT JOIN follow_up fu ON fu.action_id = a.id
    WHERE a.market_id = ${marketId}::uuid AND m.company_id = ${companyId}::uuid
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `);
  return result.rows.map((r) => ({
    id: r.id,
    type: r.type,
    contactType: r.contact_type,
    result: r.result,
    resultingStatus: r.resulting_status,
    cooldownUntil: r.cooldown_until,
    interestLevel: r.interest_level,
    feedbackReason: r.feedback_reason,
    salesStage: r.sales_stage,
    salesValue: r.sales_value != null ? parseFloat(r.sales_value) : null,
    followUpDueAt: r.follow_up_due_at,
    userId: r.user_id,
    userName: r.user_name,
    createdAt: r.created_at,
    payload: r.payload ?? {},
    offlineRecorded: r.offline_recorded,
    note: r.note_content,
  }));
}
