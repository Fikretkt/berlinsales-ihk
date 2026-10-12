import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { ok, validationFailed, withErrorHandler } from "@/lib/http/response";
import { permanentlyDeleteMarket } from "@/lib/markets/delete";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return validationFailed("Ungültige Kunden-ID");
    await permanentlyDeleteMarket(id, admin);
    return ok({ deleted: true });
  });
}
