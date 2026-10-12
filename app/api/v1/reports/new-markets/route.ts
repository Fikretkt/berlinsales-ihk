import { NextRequest } from "next/server";
import { z } from "zod";
import { newMarketsReport } from "@/lib/reports/queries";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler } from "@/lib/http/response";

const schema = z.object({ days: z.coerce.number().int().min(1).max(365).optional() });

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const parsed = schema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    const days = parsed.success ? parsed.data.days ?? 30 : 30;
    const items = await newMarketsReport(user.companyId, days);
    return ok({ items, days });
  });
}
