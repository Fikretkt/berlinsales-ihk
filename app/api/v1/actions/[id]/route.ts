// DELETE /api/v1/actions/:id — Rückgängig (nur eigene, <30s alt).

import { NextRequest } from "next/server";
import { z } from "zod";
import { undoAction } from "@/lib/actions/undo";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige Aktion-ID");
    }
    const result = await undoAction(id, user);
    return ok({
      undone: true,
      market_id: result.marketId,
      new_status: result.newStatus,
    });
  });
}
