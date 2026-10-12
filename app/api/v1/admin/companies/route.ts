import { listCompanies } from "@/lib/users/admin";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";

export async function GET() {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const items = await listCompanies(admin);
    return ok({ items });
  });
}
