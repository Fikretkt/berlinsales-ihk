import { NextRequest } from "next/server";
import { z } from "zod";
import { deactivateMarket } from "@/lib/markets/crud";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const user = await requireAdmin();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige Markt-ID");
    }
    await deactivateMarket(id, user);
    return ok({ deactivated: true });
  });
}
