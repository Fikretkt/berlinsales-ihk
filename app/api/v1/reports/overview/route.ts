import { NextRequest } from "next/server";
import { z } from "zod";
import { overviewReport } from "@/lib/reports/queries";
import { requireUser } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

const schema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export async function GET(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireUser();
    const parsed = schema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return validationFailed("from/to fehlen oder ungültig");
    const result = await overviewReport(user.companyId, new Date(parsed.data.from), new Date(parsed.data.to));
    return ok(result);
  });
}
