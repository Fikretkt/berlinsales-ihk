// POST /api/v1/auth/login
// Login per Email + Passwort. Bei Erfolg: Session-Cookie + User-Profil.
// Auth.js v5 macht das Cookie-Management; wir nutzen signIn("credentials").

import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { fail, ok, validationFailed } from "@/lib/http/response";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return validationFailed("Email und Passwort sind erforderlich");
  }

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(
        { code: "INVALID_CREDENTIALS", message: "Email oder Passwort falsch" },
        401,
      );
    }
    throw err;
  }

  // Übergangsweise Bereinigung des Legacy-Cookie-Namens (MarktSync -> ITMART Migration)
  try {
    const cookieStore = await cookies();
    cookieStore.delete("marktsync_session");
  } catch {
    // Best-effort transitional cleanup
  }

  return ok({ logged_in: true });
}
