// GET /api/v1/admin/markets — Admin-Liste inkl. inaktiver Märkte

import { NextRequest } from "next/server";
import { z } from "zod";
import { listAdminMarkets } from "@/lib/markets/crud";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const querySchema = z.object({
  search: z.string().min(1).max(100).optional(),
  include_inactive: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return validationFailed(parsed.error.issues[0]?.message ?? "Ungültige Query");
    }
    const result = await listAdminMarkets(admin.companyId, {
      search: parsed.data.search,
      includeInactive: parsed.data.include_inactive === "true",
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return ok(result);
  });
}
