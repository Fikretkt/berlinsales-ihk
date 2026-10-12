// POST /api/v1/markets/:id/interactions — field contact with existing visit status semantics.

import { z } from "zod";
import { insertAction } from "@/lib/actions/insert";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";
import {
  salesStageSchema,
  interestLevelSchema,
  feedbackReasonSchema,
  followUpInputSchema,
} from "@/lib/sales/types";

const idSchema = z.string().uuid();
const bodySchema = z.object({
  contact_type: z.enum(["visit", "phone", "email", "other"]),
  result: z.enum(["success", "escalation", "declined", "no_contact"]),
  note: z.string().max(1000).optional(),
  interest_level: interestLevelSchema.nullable().optional(),
  feedback_reason: feedbackReasonSchema.nullable().optional(),
  sales_stage: salesStageSchema.nullable().optional(),
  sales_value: z.number().min(0).max(100_000_000).nullable().optional(),
  follow_up: followUpInputSchema.nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return validationFailed("Ungültige Markt-ID");
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }

    const result = await insertAction(
      {
        marketId: id,
        type: "visit",
        result: parsed.data.result,
        contactType: parsed.data.contact_type,
        note: parsed.data.note ?? null,
        interestLevel: parsed.data.interest_level ?? null,
        feedbackReason: parsed.data.feedback_reason ?? null,
        salesStage: parsed.data.sales_stage ?? null,
        salesValue: parsed.data.sales_value ?? null,
        followUpType: parsed.data.follow_up?.type ?? null,
        followUpDueAt: parsed.data.follow_up?.due_at ?? null,
      },
      user,
    );

    return ok(
      {
        action_id: result.actionId,
        new_status: result.newStatus,
        cooldown_until: result.cooldownUntil,
        sales_stage: result.salesStage,
        follow_up_due_at: result.followUpDueAt,
        no_contact: result.noContact,
      },
      201,
    );
  });
}
