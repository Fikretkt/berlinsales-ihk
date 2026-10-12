// POST /api/v1/auth/logout
// Beendet die Session. Auth.js macht das Cookie-Clear.

import { signOut } from "@/auth";
import { cookies } from "next/headers";
import { ok } from "@/lib/http/response";

export async function POST() {
  await signOut({ redirect: false });

  // Übergangsweise Bereinigung des Legacy-Cookie-Namens (MarktSync -> ITMART Migration)
  try {
    const cookieStore = await cookies();
    cookieStore.delete("marktsync_session");
  } catch {
    // Best-effort transitional cleanup
  }

  return ok({ logged_out: true });
}
