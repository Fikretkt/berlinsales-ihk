// GET /api/v1/dashboard/today
// Liefert die Tagesansicht für den aktuell eingeloggten Vertriebsmitarbeiter.

import { requireUser } from "@/lib/auth/session";
import { getEmployeeTodayDashboard } from "@/lib/dashboard/today";
import { ok, withErrorHandler } from "@/lib/http/response";

export async function GET() {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const data = await getEmployeeTodayDashboard(
      user.companyId,
      user.id,
      user.name,
    );
    return ok(data);
  });
}
