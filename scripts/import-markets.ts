// Initial-Import: liest beide Excel-Quellen, normalisiert auf das Markt-Schema,
// geocodet via Nominatim, schreibt per Upsert in die DB.
//
// Verwendung:
//   pnpm exec tsx scripts/import-markets.ts [--dry-run] [--no-geocode] [--limit N]
//
// Idempotent: kann mehrfach laufen — bestehende Märkte werden über GLN gematcht
// und aktualisiert. Geocodete Koordinaten bleiben erhalten, wenn schon vorhanden.

import { config } from "dotenv";
config({ path: ".env.local" });
config(); // fallback .env
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import pg from "pg";
import { geocode } from "../lib/csv/geocode";

const { Pool } = pg;

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has("--dry-run");
const NO_GEOCODE = ARGS.has("--no-geocode");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1]!, 10) : Infinity;

const REWE_FILE =
  "C:/Users/AjvaziVullnet/Downloads/Kopie von KD-Liste REWE Ost komplett Stand September 2018 Lieferant.xlsx";
const BB_FILE = "C:/Users/AjvaziVullnet/Downloads/1. Filialliste BB - 2023.xls";

// =============================================================================
// Normalisierte Markt-Zeile
// =============================================================================
interface MarketRow {
  source: string;
  chain: string;
  name: string;
  gln: string;
  streetFull: string;
  postalCode: string;
  city: string;
  district: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
}

// =============================================================================
// Source 1: REWE Ost — Sheet "Berlin" (Header-Zeile vorhanden)
// =============================================================================
function readReweBerlin(): MarketRow[] {
  const wb = XLSX.read(readFileSync(REWE_FILE), { type: "buffer" });
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(
    wb.Sheets["Berlin"]!,
    { defval: null, raw: true },
  );
  const out: MarketRow[] = [];
  for (const r of rows) {
    const gln = String(r["GLN"] ?? "").trim();
    if (gln.length !== 13) continue;
    const markttyp = String(r["Markttyp"] ?? "").trim();
    const chain = markttyp === "Center" ? "REWE Center" : "REWE";
    const street = String(r["Berlin"] ?? "").trim();
    const plz = String(r["PLZ"] ?? "").trim();
    const ort = String(r["Ort"] ?? "").trim();
    // Ort kommt als "Berlin/Mitte" — Bezirk extrahieren
    const ortParts = ort.split("/");
    const city = ortParts[0]?.trim() || "Berlin";
    const district = ortParts[1]?.trim() ?? null;
    const tel = [r["Vorwahl"], r["Tel"]].filter(Boolean).join(" ").trim() || null;
    const titel = String(r["Ansprech-Titel"] ?? "").trim();
    const vorname = String(r["Ansprech Vorname"] ?? "").trim();
    const nachname = String(r["Ansprech-Name"] ?? "").trim();
    const contact = [titel, vorname, nachname].filter(Boolean).join(" ").trim() || null;
    const firmierung = String(r["Adresse Firmierung"] ?? "").trim();

    out.push({
      source: "REWE Berlin 2018",
      chain,
      name: firmierung || `REWE ${ort}`,
      gln,
      streetFull: street,
      postalCode: plz.padStart(5, "0").slice(0, 5),
      city,
      district,
      contactPerson: contact,
      contactPhone: tel,
    });
  }
  return out;
}

// =============================================================================
// Source 2: REWE Ost — Sheet "Ostdeutschland" (KEIN Header, erste Zeile = Daten)
// Spalten (0-indexed): 0=Bundesland, 1=Markttyp, 6=GLN, 7=Firmierung,
//                      8=Strasse, 9=PLZ, 10=Ort, 12=Vorwahl, 15=Email,
//                      16=Titel, 17=Vorname, 18=Nachname
// =============================================================================
function readReweBrandenburg(): MarketRow[] {
  const wb = XLSX.read(readFileSync(REWE_FILE), { type: "buffer" });
  const sheet = wb.Sheets["Ostdeutschland"]!;
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const out: MarketRow[] = [];
  for (const r of raw) {
    if (r[0] !== "Brandenburg") continue;
    const gln = String(r[6] ?? "").trim();
    if (gln.length !== 13) continue;
    const markttyp = String(r[1] ?? "").trim();
    const chain = markttyp === "Center" ? "REWE Center" : "REWE";
    const street = String(r[8] ?? "").trim();
    const plz = String(r[9] ?? "").trim();
    const ort = String(r[10] ?? "").trim();
    const vorwahl = String(r[12] ?? "").trim();
    const firmierung = String(r[7] ?? "").trim();
    const titel = String(r[16] ?? "").trim();
    const vorname = String(r[17] ?? "").trim();
    const nachname = String(r[18] ?? "").trim();
    const contact = [titel, vorname, nachname].filter(Boolean).join(" ").trim() || null;

    out.push({
      source: "REWE Brandenburg 2018",
      chain,
      name: firmierung || `REWE ${ort}`,
      gln,
      streetFull: street,
      postalCode: plz.padStart(5, "0").slice(0, 5),
      city: ort,
      district: null,
      contactPerson: contact,
      contactPhone: vorwahl || null,
    });
  }
  return out;
}

// =============================================================================
// Source 3: Filialliste BB 2023 (Edeka-Familie in Berlin+Brandenburg)
// =============================================================================
function readEdekaFamilie(): MarketRow[] {
  const wb = XLSX.read(readFileSync(BB_FILE), { type: "buffer" });
  const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["Kundenliste"]!, {
    header: 1,
    raw: true,
    defval: null,
  });
  const headers = (raw[2] as (string | null)[]).map((h) => h ?? "");
  const data = raw.slice(3).filter((r) => r.some((c) => c != null && c !== ""));
  const col = (name: string) => headers.indexOf(name);
  const cGln = col("GLN Nummer");
  const cKunde = col("Kunde");
  const cName1 = col("Name 1");
  const cName2 = col("Name 2");
  const cStrasse = col("Strasse");
  const cPlz = col("Postleitzahl");
  const cOrt = col("Ort");
  const cTel = col("Telefon-1");
  const cVertrieb = col("Boersenvertriebsschi");
  const cBranche = col("Branchenbez.");
  const cBundesland = col("Bundesland als Text");

  function pickChain(branche: string, vertrieb: string): string | null {
    if (branche === "Edeka Berlin" || branche === "Edeka Ost") return "Edeka";
    if (branche === "EDEKA center BB") return "Edeka Center";
    if (branche === "NAH & GUT Berlin") return "NAH & GUT";
    if (branche === "NP-MARKT Berlin") return "NP-Markt";
    if (branche === "Marktkauf Ost") return "Marktkauf";
    if (vertrieb === "REICHELT") return "Reichelt";
    return null;
  }

  const out: MarketRow[] = [];
  for (const r of data) {
    const bundesland = String(r[cBundesland] ?? "").trim();
    if (bundesland !== "Berlin" && bundesland !== "Brandenburg") continue;
    const gln = String(r[cGln] ?? "").trim();
    if (gln.length !== 13) continue;
    const branche = String(r[cBranche] ?? "").trim();
    const vertrieb = String(r[cVertrieb] ?? "").trim();
    const chain = pickChain(branche, vertrieb);
    if (!chain) continue; // andere Branchen ignorieren (Konsum, Cap-Märkte, etc.)

    const name1 = String(r[cName1] ?? "").trim();
    const name2 = String(r[cName2] ?? "").trim();
    const kunde = String(r[cKunde] ?? "").trim();
    const ort = String(r[cOrt] ?? "").trim();
    const name = name1 || kunde || `${chain} ${ort}`;
    const street = String(r[cStrasse] ?? "").trim();
    const plz = String(r[cPlz] ?? "").trim();
    const tel = String(r[cTel] ?? "").trim() || null;

    out.push({
      source: "Filialliste BB 2023",
      chain,
      name,
      gln,
      streetFull: street,
      postalCode: plz.padStart(5, "0").slice(0, 5),
      city: ort,
      district: null,
      contactPerson: name2 || null,
      contactPhone: tel,
    });
  }
  return out;
}

// =============================================================================
// Dedup über GLN: bei Konflikten gewinnt die NEUERE Quelle (BB 2023 > REWE 2018)
// =============================================================================
function dedupeByGln(rows: MarketRow[]): MarketRow[] {
  const map = new Map<string, MarketRow>();
  // BB 2023 zuletzt, gewinnt also bei Konflikt
  const order = [
    ...rows.filter((r) => r.source.includes("REWE")),
    ...rows.filter((r) => r.source.includes("BB 2023")),
  ];
  for (const r of order) map.set(r.gln, r);
  return [...map.values()];
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  const t0 = Date.now();
  console.log("Lade Excel-Quellen...");
  const reweBerlin = readReweBerlin();
  const reweBrandenburg = readReweBrandenburg();
  const edekaFamilie = readEdekaFamilie();
  console.log(
    `  REWE Berlin: ${reweBerlin.length}, REWE Brandenburg: ${reweBrandenburg.length}, Edeka-Familie: ${edekaFamilie.length}`,
  );

  let allRows = [...reweBerlin, ...reweBrandenburg, ...edekaFamilie];
  allRows = dedupeByGln(allRows);
  if (LIMIT < allRows.length) allRows = allRows.slice(0, LIMIT);
  console.log(`Nach Dedup: ${allRows.length} Märkte zu importieren.`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN: erste 5 Märkte ---");
    for (const r of allRows.slice(0, 5)) console.log(r);
    console.log("\nKein DB-Schreibvorgang (--dry-run).");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt");
  const pool = new Pool({ connectionString: url });

  const companies = await pool.query<{ id: string }>("SELECT id FROM company ORDER BY id");
  if (companies.rows.length !== 1) {
    throw new Error("Initial import requires exactly one company; use the tenant-scoped admin CSV import when multiple companies exist.");
  }
  const companyId = companies.rows[0]!.id;

  // Chain-Map laden
  const chainRes = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM chain",
  );
  const chainIdByName = new Map(chainRes.rows.map((r) => [r.name, r.id]));
  for (const r of allRows) {
    if (!chainIdByName.has(r.chain)) {
      throw new Error(
        `Chain "${r.chain}" nicht im Seed. Migration 0001 erweitern.`,
      );
    }
  }

  let inserted = 0;
  let updated = 0;
  let geocoded = 0;
  const skippedGeo: { row: MarketRow; reason: string }[] = [];

  // GLN → bestehende Markt-Info (für Upsert + Geo-Check)
  const existingRes = await pool.query<{
    id: string;
    gln: string;
    lat: string;
    lng: string;
  }>(
    `SELECT id, gln, lat::text, lng::text FROM market WHERE company_id = $1 AND active = TRUE AND merged_into_id IS NULL`,
    [companyId],
  );
  const existingByGln = new Map(existingRes.rows.map((r) => [r.gln, r]));

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i]!;
    const existing = existingByGln.get(r.gln);

    let lat: number | null = null;
    let lng: number | null = null;
    if (existing) {
      // Vorhandene Koordinaten behalten
      lat = parseFloat(existing.lat);
      lng = parseFloat(existing.lng);
    } else if (!NO_GEOCODE) {
      try {
        const geo = await geocode(r.streetFull, r.postalCode, r.city);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          geocoded++;
        } else {
          skippedGeo.push({ row: r, reason: "Nominatim: kein Treffer" });
        }
      } catch (err) {
        skippedGeo.push({
          row: r,
          reason: `Geocoding-Fehler: ${(err as Error).message}`,
        });
      }
    }

    if (lat === null || lng === null) {
      if (i % 20 === 0)
        console.log(`  [${i + 1}/${allRows.length}] geocoded=${geocoded} skipped=${skippedGeo.length}`);
      continue;
    }

    const chainId = chainIdByName.get(r.chain)!;
    if (existing) {
      await pool.query(
        `UPDATE market SET
           name = $1, street_full = $2, postal_code = $3, city = $4, district = $5,
           contact_person = $6, contact_phone = $7, chain_id = $8, updated_at = NOW()
         WHERE id = $9 AND company_id = $10`,
        [
          r.name,
          r.streetFull,
          r.postalCode,
          r.city,
          r.district,
          r.contactPerson,
          r.contactPhone,
          chainId,
          existing.id,
          companyId,
        ],
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO market (
           company_id, chain_id, name, gln, street_full, postal_code, city, district,
           lat, lng, contact_person, contact_phone, active, external_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13)`,
        [
          companyId,
          chainId,
          r.name,
          r.gln,
          r.streetFull,
          r.postalCode,
          r.city,
          r.district,
          lat.toFixed(7),
          lng.toFixed(7),
          r.contactPerson,
          r.contactPhone,
          r.source,
        ],
      );
      inserted++;
    }

    if (i % 20 === 0)
      console.log(`  [${i + 1}/${allRows.length}] inserted=${inserted} updated=${updated} geocoded=${geocoded} skipped=${skippedGeo.length}`);
  }

  // Skip-Report schreiben
  if (skippedGeo.length > 0) {
    const reportPath = `import-skip-report-${Date.now()}.json`;
    writeFileSync(reportPath, JSON.stringify(skippedGeo, null, 2), "utf8");
    console.log(`\nSkip-Report geschrieben: ${reportPath}`);
  }

  // Audit-Eintrag (System-Nutzer ist null)
  await pool.query(
    `INSERT INTO audit_log (company_id, user_id, event, payload) VALUES (
       $1, NULL, 'markets_csv_imported',
       $2::jsonb
     )`,
    [
      companyId,
      JSON.stringify({
        mode: "initial-import",
        imported: inserted,
        updated,
        skipped_duplicates: 0,
        errors_count: skippedGeo.length,
        sources: ["REWE Ost 2018", "Filialliste BB 2023"],
      }),
    ],
  );

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nFertig in ${dt}s:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Geocoded: ${geocoded}`);
  console.log(`  Skipped:  ${skippedGeo.length}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
