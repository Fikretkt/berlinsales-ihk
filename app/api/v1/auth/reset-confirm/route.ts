// POST /api/v1/auth/reset-confirm — { token, password } → Passwort neu setzen + auto-login

import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { verifyToken, consumeToken } from "@/lib/auth/tokens";
import { signIn } from "@/auth";
import { fail, ok, validationFailed } from "@/lib/http/response";

const schema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig", "password");
  }

  const verified = await verifyToken(db, parsed.data.token, "reset");
  if (!verified) {
    return fail({ code: "TOKEN_INVALID", message: "Link ist abgelaufen oder ungültig" }, 410);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.transaction(async (tx) => {
    await tx.update(userTable).set({ passwordHash }).where(eq(userTable.id, verified.userId));
    await consumeToken(tx, verified.id);
  });

  const rows = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, verified.userId))
    .limit(1);
  if (rows[0]?.email) {
    try {
      await signIn("credentials", {
        email: rows[0].email,
        password: parsed.data.password,
        redirect: false,
      });
    } catch {
      // signIn-Fehler nicht blockierend
    }
  }

  return ok({ password_reset: true });
}
