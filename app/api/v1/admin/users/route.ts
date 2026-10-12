// GET /api/v1/admin/users — Liste
// POST /api/v1/admin/users — Einladen

import { NextRequest } from "next/server";
import { z } from "zod";
import { listUsers, inviteUser } from "@/lib/users/admin";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

export async function GET() {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const items = await listUsers(admin);
    return ok({ items });
  });
}

const inviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(2).max(200),
  role: z.enum(["field_user", "admin"]),
});

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const body = await req.json().catch(() => null);
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return validationFailed(
        parsed.error.issues[0]?.message ?? "Eingabe ungültig",
        parsed.error.issues[0]?.path.join("."),
      );
    }
    const res = await inviteUser(
      {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
      },
      admin,
    );
    return ok(
      {
        user_id: res.userId,
        email_sent: res.emailSent,
        email_error: res.emailError,
      },
      201,
    );
  });
}
