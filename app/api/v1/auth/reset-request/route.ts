// POST /api/v1/auth/reset-request — Passwort vergessen.
// Antwort IMMER 200 (Anti-Enumeration laut API-Spec).
// Bei Treffer: Reset-Token erzeugen + E-Mail senden, TTL 1h.

import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { createToken, invalidateActiveTokens } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/email/send";
import { passwordReset } from "@/lib/email/templates";
import { ok } from "@/lib/http/response";

const schema = z.object({ email: z.string().email().toLowerCase() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  // Anti-Enumeration: bei ungültigem Body genauso 200 antworten.
  if (!parsed.success) return ok({ sent: true });

  const rows = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(and(eq(userTable.email, parsed.data.email), eq(userTable.active, true)))
    .limit(1);

  const u = rows[0];
  if (u) {
    // Vorherige Reset-Tokens des Users invalidieren (single-use).
    await invalidateActiveTokens(db, u.id, "reset");
    const { rawToken } = await createToken(db, u.id, "reset");
    const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/auth/reset-confirm?token=${encodeURIComponent(rawToken)}`;
    const tpl = passwordReset({
      appUrl: baseUrl,
      recipientName: u.name,
      resetUrl,
    });
    await sendMail({ to: u.email, ...tpl });
  }

  return ok({ sent: true });
}
