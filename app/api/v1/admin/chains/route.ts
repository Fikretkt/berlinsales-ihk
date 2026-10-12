// GET /api/v1/admin/chains — Ketten-Auswahl für Dropdowns

import { listChains } from "@/lib/markets/crud";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";

export async function GET() {
  return withErrorHandler(async () => {
    // Auch normale User dürfen das (für Markt-Anlegen-Formular).
    await requireUser();
    const chains = await listChains();
    return ok({ items: chains });
  });
}
