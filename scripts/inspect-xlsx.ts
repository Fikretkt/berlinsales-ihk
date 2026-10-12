// Schnell-Inspektion der Excel-Listen: Sheets, Spalten-Header, Zeilen-Anzahl, Beispiel-Zeilen.
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: tsx scripts/inspect-xlsx.ts <file1.xlsx> [file2.xlsx ...]");
  process.exit(1);
}

for (const file of files) {
  console.log("\n========================================");
  console.log("FILE:", file);
  console.log("========================================");
  const buf = readFileSync(file);
  const wb = XLSX.read(buf, { type: "buffer" });
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: true,
    });
    console.log(`\n--- Sheet: "${sheetName}" — ${json.length} rows ---`);
    if (json.length > 0) {
      const headers = Object.keys(json[0]!);
      console.log("Headers:");
      for (const h of headers) console.log("  -", h);
      console.log("\nFirst 2 rows (sample):");
      for (const row of json.slice(0, 2)) {
        console.log(JSON.stringify(row, null, 2));
      }
    }
  }
}
