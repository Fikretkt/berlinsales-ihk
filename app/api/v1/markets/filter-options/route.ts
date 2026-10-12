import { listMarketFilterOptions } from "@/lib/markets/repo";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";

export async function GET() {
  return withErrorHandler(async () => {
    const user = await requireUser();
    return ok(await listMarketFilterOptions(user.companyId));
  });
}
