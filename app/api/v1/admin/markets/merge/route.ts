// POST /api/v1/admin/markets/merge — Markt-Merge (Admin)

import { NextRequest } from "next/server";
import { z } from "zod";
import { mergeMarkets } from "@/lib/markets/crud";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const schema = z.object({
  primary_id: z.string().uuid(),
  duplicate_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireAdmin();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }
    const result = await mergeMarkets(
      parsed.data.primary_id,
      parsed.data.duplicate_id,
      user,
    );
    return ok({
      primary_id: parsed.data.primary_id,
      duplicate_id: parsed.data.duplicate_id,
      notes_moved: result.notesMoved,
      actions_moved: result.actionsMoved,
      reservations_cancelled: result.reservationsCancelled,
    });
  });
}
