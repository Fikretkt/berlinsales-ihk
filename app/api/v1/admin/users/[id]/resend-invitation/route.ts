import { NextRequest } from "next/server";
import { z } from "zod";
import { resendInvitation } from "@/lib/users/admin";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withErrorHandler(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return validationFailed("Ungültige Benutzer-ID");
    }
    const res = await resendInvitation(id, admin);
    return ok({ email_sent: res.emailSent, email_error: res.emailError });
  });
}
