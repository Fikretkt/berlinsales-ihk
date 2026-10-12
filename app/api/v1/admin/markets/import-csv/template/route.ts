import { buildCsvTemplate } from "@/lib/csv/import";
import { requireAdmin } from "@/lib/auth/session";
import { withErrorHandler } from "@/lib/http/response";

export async function GET() {
  return withErrorHandler(async () => {
    await requireAdmin();
    const text = buildCsvTemplate();
    return new Response(text, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="itmart-vorlage.csv"',
      },
    });
  });
}
