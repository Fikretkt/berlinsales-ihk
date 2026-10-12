// GET /api/v1/markets/:id/actions/history — letzte N Aktionen

import { NextRequest } from "next/server";
import { z } from "zod";
import { listMarketHistory } from "@/lib/actions/history";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const idSchema = z.string().uuid();
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) return validationFailed("Ungültige Markt-ID");
    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const limit = parsed.success ? parsed.data.limit ?? 20 : 20;
    const items = await listMarketHistory(user.companyId, id, limit);
    return ok({ items });
  });
}
