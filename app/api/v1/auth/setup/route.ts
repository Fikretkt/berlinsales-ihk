// GET /api/v1/auth/setup?token=...   → Token gültig? (200 oder 410)
// POST /api/v1/auth/setup             → { token, password } → Passwort setzen + auto-login

import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user as userTable, auditLog } from "@/lib/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { verifyToken, consumeToken } from "@/lib/auth/tokens";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { signIn } from "@/auth";
import { fail, ok, validationFailed } from "@/lib/http/response";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return validationFailed("Token fehlt");
  const verified = await verifyToken(db, token, "setup");
  if (!verified) {
    return fail({ code: "TOKEN_INVALID", message: "Link ist abgelaufen oder ungültig" }, 410);
  }
  return ok({ valid: true });
}

const postSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error.issues[0]?.message ?? "Eingabe ungültig", "password");
  }
  const verified = await verifyToken(db, parsed.data.token, "setup");
  if (!verified) {
    return fail({ code: "TOKEN_INVALID", message: "Link ist abgelaufen oder ungültig" }, 410);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const targetUser = await db
    .select({ companyId: userTable.companyId })
    .from(userTable)
    .where(eq(userTable.id, verified.userId))
    .limit(1);
  if (!targetUser[0]) return fail({ code: "TOKEN_INVALID", message: "Link ist ungültig" }, 410);

  await db.transaction(async (tx) => {
    await tx.update(userTable).set({ passwordHash }).where(eq(userTable.id, verified.userId));
    await consumeToken(tx, verified.id);
    await tx.insert(auditLog).values({
      companyId: targetUser[0]!.companyId,
      userId: verified.userId,
      event: AUDIT_EVENTS.USER_ACTIVATED,
      payload: { via: "setup_token" },
    });
  });

  // E-Mail des Users für signIn holen
  const rows = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, verified.userId))
    .limit(1);
  const email = rows[0]?.email;
  if (email) {
    try {
      await signIn("credentials", {
        email,
        password: parsed.data.password,
        redirect: false,
      });
    } catch {
      // Ignorieren: signIn-Fehler nicht blockierend — User kann manuell einloggen.
    }
  }

  return ok({ activated: true });
}

// helper für consume innerhalb transaction
void sql;
