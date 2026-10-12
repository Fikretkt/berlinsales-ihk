// POST /api/v1/admin/conflict-reports/:id/resolve — Admin markiert Bericht als bearbeitet.

import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { action, auditLog, market } from "@/lib/db/schema";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const schema = z.object({
  resolution_note: z.string().max(2000).optional(),
  linked_action_id: z.string().uuid().nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige Report-ID");
    }
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }

    const report = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(
        eq(auditLog.id, id),
        eq(auditLog.companyId, admin.companyId),
        eq(auditLog.event, AUDIT_EVENTS.OFFLINE_CONFLICT_REPORTED),
      ))
      .limit(1);
    if (!report[0]) {
      return validationFailed("Report nicht gefunden");
    }
    if (parsed.data.linked_action_id) {
      const linkedAction = await db
        .select({ id: action.id })
        .from(action)
        .innerJoin(market, eq(market.id, action.marketId))
        .where(and(
          eq(action.id, parsed.data.linked_action_id),
          eq(market.companyId, admin.companyId),
        ))
        .limit(1);
      if (!linkedAction[0]) {
        return validationFailed("Verknüpfte Aktion nicht gefunden", "linked_action_id");
      }
    }

    await db.insert(auditLog).values({
      companyId: admin.companyId,
      userId: admin.id,
      event: AUDIT_EVENTS.OFFLINE_CONFLICT_RESOLVED,
      payload: {
        linked_report_id: id,
        linked_action_id: parsed.data.linked_action_id ?? null,
        resolution_note: parsed.data.resolution_note ?? null,
      },
    });

    return ok({ resolved: true });
  });
}
