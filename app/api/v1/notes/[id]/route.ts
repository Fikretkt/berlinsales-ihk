// PATCH /api/v1/notes/:id — eigene Notiz bearbeiten (24h-Fenster)

import { NextRequest } from "next/server";
import { z } from "zod";
import { updateNote } from "@/lib/notes/repo";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";
import { hostDbAuswahl } from "@/lib/db/dbAuswahl";
import { HttpError } from "@/lib/http/errors";

const idSchema = z.string().uuid();
const bodySchema = z.object({ content: z.string().min(1).max(5000) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const host = req.headers.get("host");

    if (!host) {
      throw new HttpError(400, "HOST_REQUIRED", "Host fehlt");
    }
    const requestDb = hostDbAuswahl(host);
    const user = await requireUser(requestDb);
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return validationFailed("Ungültige Notiz-ID");
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }
    await updateNote(id, parsed.data.content, user, requestDb);
    return ok({ updated: true });
  });
}
