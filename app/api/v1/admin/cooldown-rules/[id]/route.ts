// PATCH /api/v1/admin/cooldown-rules/:id — Dauer anpassen

import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { cooldownRule, auditLog } from "@/lib/db/schema";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { requireAdmin } from "@/lib/auth/session";
import { ok, fail, withErrorHandler, validationFailed } from "@/lib/http/response";

const schema = z.object({ duration_days: z.number().int().min(0).max(365) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige ID");
    }
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Ungültiger Wert");
    }

    const before = await db
      .select({
        id: cooldownRule.id,
        actionType: cooldownRule.actionType,
        result: cooldownRule.result,
        durationDays: cooldownRule.durationDays,
      })
      .from(cooldownRule)
      .where(eq(cooldownRule.id, id))
      .limit(1);
    if (before.length === 0) {
      return fail({ code: "RULE_NOT_FOUND", message: "Cooldown-Regel nicht gefunden" }, 404);
    }
    const old = before[0]!;

    if (old.durationDays === parsed.data.duration_days) {
      return ok({ updated: false, message: "Keine Änderung" });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(cooldownRule)
        .set({
          durationDays: parsed.data.duration_days,
          updatedAt: sql`NOW()`,
          updatedByUserId: admin.id,
        })
        .where(eq(cooldownRule.id, id));

      await tx.insert(auditLog).values({
        companyId: admin.companyId,
        userId: admin.id,
        event: AUDIT_EVENTS.COOLDOWN_RULE_CHANGED,
        payload: {
          rule_id: id,
          action_type: old.actionType,
          result: old.result,
          before: old.durationDays,
          after: parsed.data.duration_days,
        },
      });
    });

    return ok({ updated: true });
  });
}
