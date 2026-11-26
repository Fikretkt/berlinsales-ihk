import { NextRequest } from "next/server";
import { z } from "zod";
import { deactivateMarket } from "@/lib/markets/crud";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";
import { hostDbAuswahl } from "@/lib/db/dbAuswahl";
import { HttpError } from "@/lib/http/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const host = req.headers.get("host");

    if (!host) {
      throw new HttpError(400, "HOST_REQUIRED", "Host fehlt");
    }

    const requestDb = hostDbAuswahl(host);
    const user = await requireAdmin(requestDb);

    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige Markt-ID");
    }

    await deactivateMarket(id, user, requestDb);

    return ok({ deactivated: true });
  });
}