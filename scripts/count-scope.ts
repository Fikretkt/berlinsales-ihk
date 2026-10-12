// Genaue Zählung für Scope "Edeka + REWE, Berlin + Brandenburg".
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

// === REWE Berlin (Datei 1, Sheet "Berlin") ===
const reweBerlinWb = XLSX.read(
  readFileSync(
    "C:/Users/AjvaziVullnet/Downloads/Kopie von KD-Liste REWE Ost komplett Stand September 2018 Lieferant.xlsx",
  ),
  { type: "buffer" },
);
const reweBerlin: Record<string, unknown>[] = XLSX.utils.sheet_to_json(
  reweBerlinWb.Sheets["Berlin"]!,
  { defval: null, raw: true },
);
const reweBerlinValid = reweBerlin.filter(
  (r) => String(r["GLN"] ?? "").length === 13,
);
console.log(`REWE Berlin (mit valider GLN): ${reweBerlinValid.length}`);

// === REWE Brandenburg (Datei 1, Sheet "Ostdeutschland") ===
// Erste Zeile ist schon Daten — also komplettes Array, mit Header-Mapping.
const reweOstSheet = reweBerlinWb.Sheets["Ostdeutschland"]!;
const reweOstRaw: unknown[][] = XLSX.utils.sheet_to_json(reweOstSheet, {
  header: 1,
  raw: true,
  defval: null,
});
// Spalten manuell (aus dem Inspect): 0=Bundesland, 1=Markttyp, 2=Markttyp nur SM,
// 3-5=Zahlen, 6=GLN, 7=Firmierung, 8=Straße, 9=PLZ, 10=Ort, ...
const reweBrandenburg = reweOstRaw.filter(
  (r) => r[0] === "Brandenburg" && String(r[6] ?? "").length === 13,
);
console.log(`REWE Brandenburg (mit valider GLN): ${reweBrandenburg.length}`);

// === Filialliste BB 2023 (Edeka-Familie in Berlin+Brandenburg) ===
const bbWb = XLSX.read(
  readFileSync("C:/Users/AjvaziVullnet/Downloads/1. Filialliste BB - 2023.xls"),
  { type: "buffer" },
);
const bbRaw: unknown[][] = XLSX.utils.sheet_to_json(bbWb.Sheets["Kundenliste"]!, {
  header: 1,
  raw: true,
  defval: null,
});
const headers = (bbRaw[2] as (string | null)[]).map((h) => h ?? "");
const data = bbRaw.slice(3).filter((r) => r.some((c) => c != null && c !== ""));
const cBranche = headers.indexOf("Branchenbez.");
const cBundesland = headers.indexOf("Bundesland als Text");
const cVertrieb = headers.indexOf("Boersenvertriebsschi");
const cGln = headers.indexOf("GLN Nummer");

const inBB = data.filter(
  (r) => r[cBundesland] === "Berlin" || r[cBundesland] === "Brandenburg",
);
const validGln = (r: unknown[]) => String(r[cGln] ?? "").length === 13;

// Aufschlüsselung für BB
const buckets: Record<string, unknown[][]> = {
  "Edeka Berlin (Branche)": [],
  "EDEKA center BB (Branche)": [],
  "Edeka Ost (Branche)": [],
  "NAH & GUT Berlin (Branche)": [],
  "NP-MARKT Berlin (Branche)": [],
  "REICHELT (Vertrieb)": [],
  "Marktkauf Ost (Branche)": [],
  "Netto/sonstige Edeka-Familie": [],
  "Andere (nicht relevant)": [],
};

for (const r of inBB) {
  if (!validGln(r)) continue;
  const branche = String(r[cBranche] ?? "").trim();
  const vertrieb = String(r[cVertrieb] ?? "").trim();
  if (branche === "Edeka Berlin") buckets["Edeka Berlin (Branche)"]!.push(r);
  else if (branche === "EDEKA center BB") buckets["EDEKA center BB (Branche)"]!.push(r);
  else if (branche === "Edeka Ost") buckets["Edeka Ost (Branche)"]!.push(r);
  else if (branche === "NAH & GUT Berlin") buckets["NAH & GUT Berlin (Branche)"]!.push(r);
  else if (branche === "NP-MARKT Berlin") buckets["NP-MARKT Berlin (Branche)"]!.push(r);
  else if (vertrieb === "REICHELT") buckets["REICHELT (Vertrieb)"]!.push(r);
  else if (branche === "Marktkauf Ost") buckets["Marktkauf Ost (Branche)"]!.push(r);
  else buckets["Andere (nicht relevant)"]!.push(r);
}

console.log("\nFilialliste BB 2023 (Berlin+Brandenburg, valide GLN):");
console.log(`  Total: ${inBB.filter(validGln).length}`);
console.log();
let edekaFamilie = 0;
for (const [name, rows] of Object.entries(buckets)) {
  console.log(`  ${name.padEnd(38)} ${rows.length}`);
  if (name !== "Andere (nicht relevant)") edekaFamilie += rows.length;
}

console.log(`\nEdeka-Familie gesamt (inkl. NAH & GUT, NP, Reichelt, Marktkauf): ${edekaFamilie}`);
console.log(`+ REWE Berlin: ${reweBerlinValid.length}`);
console.log(`+ REWE Brandenburg: ${reweBrandenburg.length}`);
console.log(`= Scope-Gesamt: ${edekaFamilie + reweBerlinValid.length + reweBrandenburg.length}`);

// Auch zeigen, was bei "Andere" rauskommt
console.log("\nWas in 'Andere' landet (Sample):");
for (const r of buckets["Andere (nicht relevant)"]!.slice(0, 10)) {
  console.log(`  ${r[cBranche]} | ${r[cVertrieb]}`);
}
