// POST /api/v1/admin/markets/import-csv — multipart-Upload, importiert CSV.

import { NextRequest } from "next/server";
import { importMarketsFromCsv, type CsvImportType, type ImportMode } from "@/lib/csv/import";
import { requireAdmin } from "@/lib/auth/session";
import { ok, withErrorHandler, validationFailed } from "@/lib/http/response";

export async function POST(req: NextRequest) {
  return withErrorHandler(async () => {
    const user = await requireAdmin();
    const form = await req.formData();
    const file = form.get("file");
    const mode = (form.get("mode") as ImportMode) || "insert-only";
    const importType = form.get("import_type") as CsvImportType | null;
    if (!(file instanceof File)) {
      return validationFailed("Datei fehlt");
    }
    if (mode !== "insert-only" && mode !== "upsert") {
      return validationFailed("Ungültiger Modus", "mode");
    }
    if (importType !== null && importType !== "markets" && importType !== "sales-pipeline") {
      return validationFailed("Ungültiger Importtyp", "import_type");
    }
    if (importType === "sales-pipeline" && mode !== "insert-only") {
      return validationFailed("Sales Pipeline CSV wird nur als neue Datensätze importiert", "mode");
    }
    const text = await file.text();
    const result = await importMarketsFromCsv(text, mode, user, importType ?? undefined);
    return ok({
      import_type: importType ?? null,
      mode: result.mode,
      total_rows: result.totalRows,
      imported: result.imported,
      updated: result.updated,
      skipped_duplicates: result.skippedDuplicates,
      errors: result.errors,
    });
  });
}
