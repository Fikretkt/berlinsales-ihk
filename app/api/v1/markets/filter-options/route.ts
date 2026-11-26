import { NextRequest } from "next/server";
import { hostDbAuswahl } from "@/lib/db/dbAuswahl";
import { listMarketFilterOptions } from "@/lib/markets/repo";
import { requireUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http/errors";
import { ok, withErrorHandler } from "@/lib/http/response";

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const host = req.headers.get("host");

    if (!host) {
      throw new HttpError(400, "HOST_REQUIRED", "Host fehlt");
    }

    const requestDb = hostDbAuswahl(host);
    const user = await requireUser(requestDb);

    return ok(
      await listMarketFilterOptions(user.companyId, requestDb),
    );
  });
}