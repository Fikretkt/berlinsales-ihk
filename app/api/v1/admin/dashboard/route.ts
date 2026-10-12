// GET /api/v1/admin/dashboard
// Liefert die aggregierte Management-Ansicht für Admins im aktuellen Mandanten.
// Mandant wird strikt aus der validierten Session abgeleitet.

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getManagementDashboard } from "@/lib/dashboard/management";
import type { ManagementPeriodKey } from "@/lib/dashboard/management-types";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const querySchema = z.object({
  period: z.enum(["today", "week", "month", "30d"]).optional(),
});

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();

    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );

    if (!parsed.success) {
      return validationFailed(
        parsed.error.issues[0]?.message ?? "Ungültiger Zeitraum-Parameter",
        "period",
      );
    }

    const periodKey: ManagementPeriodKey = parsed.data.period ?? "week";
    const data = await getManagementDashboard(admin.companyId, periodKey);

    return ok(data);
  });
}
