// Tiefere Analyse: Datentypen, Ketten-Verteilung, Berlin-Anteil, GLN-Validität.
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

function readSheet(file: string, sheetName: string, headerRow = 0) {
  const wb = XLSX.read(readFileSync(file), { type: "buffer" });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet ${sheetName} not found in ${file}`);
  // header: <number> sagt: erste N Zeilen überspringen + dann nächste Zeile als Header
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: true,
    range: headerRow,
  });
  return rows;
}

function tally<T extends string | number | null>(values: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function printTally(label: string, m: Map<unknown, number>, top = 10) {
  console.log(`\n${label} (${m.size} unique):`);
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted.slice(0, top)) {
    console.log(`  ${String(k ?? "<null>").padEnd(40)} ${v}`);
  }
  if (sorted.length > top) console.log(`  ... ${sorted.length - top} more`);
}

// === REWE Berlin ===
console.log("\n========== REWE OST — Sheet: Berlin ==========");
const reweBerlin = readSheet(
  "C:/Users/AjvaziVullnet/Downloads/Kopie von KD-Liste REWE Ost komplett Stand September 2018 Lieferant.xlsx",
  "Berlin",
);
console.log(`Total rows: ${reweBerlin.length}`);
console.log("Sample row:");
console.log(JSON.stringify(reweBerlin[0], null, 2));
printTally("Markttyp", tally(reweBerlin.map((r) => r["Markttyp"] as string)));
printTally("Bundesland", tally(reweBerlin.map((r) => r["Bundesland"] as string)));
const glnLengths = reweBerlin.map((r) => String(r["GLN"] ?? "").length);
printTally("GLN-Länge", tally(glnLengths.map((n) => String(n))));

// === REWE Ostdeutschland ===
console.log("\n========== REWE OST — Sheet: Ostdeutschland ==========");
// Header steht in der ersten Datenzeile, also range=1 überspringen.
// Aber XLSX hat sie als Header behandelt. Probieren wir mit range=undefined und dann selber strukturieren.
const reweOstWb = XLSX.read(
  readFileSync(
    "C:/Users/AjvaziVullnet/Downloads/Kopie von KD-Liste REWE Ost komplett Stand September 2018 Lieferant.xlsx",
  ),
  { type: "buffer" },
);
const reweOstSheet = reweOstWb.Sheets["Ostdeutschland"]!;
const reweOstRaw: unknown[][] = XLSX.utils.sheet_to_json(reweOstSheet, {
  header: 1,
  raw: true,
  defval: null,
});
console.log(`Raw rows (incl. header row): ${reweOstRaw.length}`);
console.log("Row 0 (header?):");
console.log(JSON.stringify(reweOstRaw[0], null, 2));
console.log("Row 1 (first data?):");
console.log(JSON.stringify(reweOstRaw[1], null, 2));

// === Filialliste BB 2023 ===
console.log("\n========== Filialliste BB 2023 — Sheet: Kundenliste ==========");
const bbWb = XLSX.read(
  readFileSync("C:/Users/AjvaziVullnet/Downloads/1. Filialliste BB - 2023.xls"),
  { type: "buffer" },
);
const bbSheet = bbWb.Sheets["Kundenliste"]!;
const bbRaw: unknown[][] = XLSX.utils.sheet_to_json(bbSheet, {
  header: 1,
  raw: true,
  defval: null,
});
console.log(`Total rows incl. notice + header: ${bbRaw.length}`);
console.log("Row 0 (notice):", JSON.stringify(bbRaw[0]));
console.log("Row 1 (headers):", JSON.stringify(bbRaw[1]));
console.log("Row 2 (first data):", JSON.stringify(bbRaw[2]));

const headers = (bbRaw[2] as (string | null)[]).map((h) => h ?? "");
const dataRows = bbRaw.slice(3).filter((r) => r.some((c) => c != null && c !== ""));
console.log(`\nNon-empty data rows: ${dataRows.length}`);

function colOf(name: string): number {
  const idx = headers.indexOf(name);
  if (idx < 0) throw new Error(`Column "${name}" not found. Headers: ${headers}`);
  return idx;
}

const colBranche = colOf("Branchenbez.");
const colBundesland = colOf("Bundesland als Text");
const colVertrieb = colOf("Boersenvertriebsschi");
const colRegion = colOf("Kundenregion");
const colGln = colOf("GLN Nummer");

printTally(
  "Branchenbez.",
  tally(dataRows.map((r) => r[colBranche] as string)),
  20,
);
printTally(
  "Bundesland",
  tally(dataRows.map((r) => r[colBundesland] as string)),
  10,
);
printTally(
  "Boersenvertriebsschiene",
  tally(dataRows.map((r) => r[colVertrieb] as string)),
  20,
);
printTally(
  "Kundenregion",
  tally(dataRows.map((r) => r[colRegion] as string)),
  20,
);
printTally(
  "GLN-Länge",
  tally(dataRows.map((r) => String(String(r[colGln] ?? "").length))),
);

// Kreuztabelle: Bundesland x Branche (nur Berlin/Brandenburg)
console.log("\nBerlin/Brandenburg — Branchen-Verteilung:");
const bbOnly = dataRows.filter(
  (r) => r[colBundesland] === "Berlin" || r[colBundesland] === "Brandenburg",
);
console.log(`Berlin+Brandenburg rows: ${bbOnly.length}`);
printTally(
  "Branche",
  tally(bbOnly.map((r) => r[colBranche] as string)),
  20,
);
printTally(
  "Vertriebsschiene",
  tally(bbOnly.map((r) => r[colVertrieb] as string)),
  20,
);
