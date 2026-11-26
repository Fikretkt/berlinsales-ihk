// GET /api/v1/admin/chains — Ketten-Auswahl für Dropdowns

import { NextRequest } from "next/server";
import { listChains } from "@/lib/markets/crud";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";
import { hostDbAuswahl } from "@/lib/db/dbAuswahl";
import { HttpError } from "@/lib/http/errors";

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const host = req.headers.get("host");

    if (!host) {
      throw new HttpError(400, "HOST_REQUIRED", "Host fehlt");
    }

    const requestDb = hostDbAuswahl(host);

    // Auch normale User dürfen das (für Markt-Anlegen-Formular).
    await requireUser(requestDb);

    const chains = await listChains(requestDb);
    return ok({ items: chains });
  });
}