// POST /api/v1/admin/markets/merge — Markt-Merge (Admin)

import { NextRequest } from "next/server";
import { z } from "zod";
import { mergeMarkets } from "@/lib/markets/crud";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";
import { hostDbAuswahl } from "@/lib/db/dbAuswahl";
import { HttpError } from "@/lib/http/errors";

const schema = z.object({
  primary_id: z.string().uuid(),
  duplicate_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const host = req.headers.get("host");

    if (!host) {
      throw new HttpError(400, "HOST_REQUIRED", "Host fehlt");
    }

    const requestDb = hostDbAuswahl(host);
    const user = await requireAdmin(requestDb);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }
    const result = await mergeMarkets(
      parsed.data.primary_id,
      parsed.data.duplicate_id,
      user,
      requestDb,
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
