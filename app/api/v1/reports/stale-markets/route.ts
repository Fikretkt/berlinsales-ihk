import { staleMarkets } from "@/lib/reports/queries";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";

export async function GET() {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const items = await staleMarkets(user.companyId);
    return ok({ items });
  });
}
