import { NextRequest } from "next/server";
import { z } from "zod";
import { updateUser } from "@/lib/users/admin";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const patchSchema = z
  .object({
    role: z.enum(["field_user", "admin"]).optional(),
    active: z.boolean().optional(),
    name: z.string().min(2).max(200).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Mindestens ein Feld muss angegeben sein");

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige Benutzer-ID");
    }
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig");
    }
    await updateUser(
      id,
      {
        role: parsed.data.role,
        active: parsed.data.active,
        name: parsed.data.name,
      },
      admin,
    );
    return ok({ updated: true });
  });
}
