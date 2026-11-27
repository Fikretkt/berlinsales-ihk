// DELETE /api/v1/actions/:id — Rückgängig (nur eigene, <30s alt).

import { NextRequest } from "next/server";
import { z } from "zod";
import { undoAction } from "@/lib/actions/undo";
import { HttpError, requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";
import { hostDbAuswahl } from "@/lib/db/dbAuswahl";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const host = req.headers.get("host");
    if (!host) throw new HttpError(400, "Host_Required", "Host fehlt");
    const requestDb = hostDbAuswahl(host);
    const user = await requireUser(requestDb);

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige Aktion-ID");
    }
    const result = await undoAction(id, user, requestDb);
    return ok({
      undone: true,
      market_id: result.marketId,
      new_status: result.newStatus,
    });
  });
}
