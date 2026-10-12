// GET /api/v1/markets/:id/notes — Liste
// POST /api/v1/markets/:id/notes — neue Notiz

import { NextRequest } from "next/server";
import { z } from "zod";
import { listNotesForMarket, createNote } from "@/lib/notes/repo";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const idSchema = z.string().uuid();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return validationFailed("Ungültige Markt-ID");
    const items = await listNotesForMarket(id, user);
    return ok({ items });
  });
}

const bodySchema = z.object({ content: z.string().min(1).max(5000) });

export async function POST(
  req: NextRequest,
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
    const note = await createNote(id, parsed.data.content, user);
    return ok(note, 201);
  });
}
