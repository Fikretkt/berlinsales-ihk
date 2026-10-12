// CSV-Import-Service. Unterstützt das ITMART-Format sowie Google-Places-Exporte.

import { parse } from "csv-parse/sync";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chain as chainTable, market as marketTable, auditLog } from "@/lib/db/schema";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import type { SessionUser } from "@/lib/http/errors";
import type { SalesStage } from "@/lib/db/schema";

export type ImportMode = "insert-only" | "upsert";
export type CsvImportType = "markets" | "sales-pipeline";
type CsvFormat = "itmart" | "google-places" | "sales-pipeline";
type CsvRecord = Record<string, string | undefined>;

export interface ImportResultRow {
  row: number;
  reason: string;
  gln?: string;
  externalId?: string;
}

export interface ImportResult {
  mode: ImportMode;
  totalRows: number;
  imported: number;
  updated: number;
  skippedDuplicates: number;
  errors: ImportResultRow[];
}

const ITMART_REQUIRED = [
  "chain", "name", "gln", "street_full", "postal_code", "city", "lat", "lng",
] as const;
const GOOGLE_PLACES_HEADERS = ["place_id", "isim", "adres", "lat", "lng"] as const;
const SALES_PIPELINE_REQUIRED = ["company_name", "stage"] as const;

const PIPELINE_STAGE_MAP: Record<string, SalesStage> = {
  qualification: "kontaktiert",
  "proposal sent": "angebot",
  negotiation: "angebot",
  "closed won": "gewonnen",
  "closed lost": "verloren",
};

const PIPELINE_MONTHS: Record<string, number> = {
  jan: 0,
  januar: 0,
  feb: 1,
  februar: 1,
  mar: 2,
  mär: 2,
  maerz: 2,
  märz: 2,
  apr: 3,
  april: 3,
  may: 4,
  mai: 4,
  jun: 5,
  juni: 5,
  jul: 6,
  juli: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  okt: 9,
  oct: 9,
  oktober: 9,
  nov: 10,
  november: 10,
  dez: 11,
  dec: 11,
  dezember: 11,
  december: 11,
};

export function normalizeDecimal(value: string | undefined): number {
  const normalized = (value ?? "").trim().replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

function isGooglePlacesFormat(headers: readonly string[]): boolean {
  return GOOGLE_PLACES_HEADERS.every((header) => headers.includes(header));
}

function isSalesPipelineFormat(headers: readonly string[]): boolean {
  return SALES_PIPELINE_REQUIRED.every((header) => headers.includes(header));
}

export function mapSalesPipelineStage(value: string | undefined): SalesStage | null {
  return PIPELINE_STAGE_MAP[(value ?? "").trim().toLowerCase()] ?? null;
}

export function parseSalesPipelineMoney(value: string | undefined): number | null {
  const input = value?.trim();
  if (!input) return null;
  const cleaned = input.replace(/[€\s\u00a0]/g, "");
  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseSalesPipelineProbability(value: string | undefined): number | null {
  const input = value?.trim();
  if (!input) return null;
  const parsed = Number(input.replace(/[%\s]/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export function parseSalesPipelineDate(value: string | undefined): Date | null {
  const input = value?.trim();
  if (!input) return null;
  const match = /^(\d{1,2})-([\p{L}]+)-(\d{4})$/u.exec(input);
  if (!match) return null;
  const day = Number(match[1]);
  const month = PIPELINE_MONTHS[match[2]!.toLowerCase()];
  const year = Number(match[3]);
  if (month === undefined || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date
    : null;
}

export async function importMarketsFromCsv(
  csvText: string,
  mode: ImportMode,
  user: SessionUser,
  importType?: CsvImportType,
): Promise<ImportResult> {
  let headers: string[] = [];
  let rows: CsvRecord[];
  try {
    const headerLine = csvText.split(/\r?\n/, 1)[0] ?? "";
    const delimiter = (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
    rows = parse(csvText, {
      columns: (header: string[]) => {
        headers = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
        return headers;
      },
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter,
      relax_column_count: true,
    }) as CsvRecord[];
  } catch (error) {
    return {
      mode, totalRows: 0, imported: 0, updated: 0, skippedDuplicates: 0,
      errors: [{ row: 1, reason: `CSV konnte nicht gelesen werden: ${(error as Error).message}` }],
    };
  }

  const format: CsvFormat | null = isSalesPipelineFormat(headers)
    ? "sales-pipeline"
    : isGooglePlacesFormat(headers)
    ? "google-places"
    : ITMART_REQUIRED.every((header) => headers.includes(header)) ? "itmart" : null;
  const result: ImportResult = {
    mode, totalRows: rows.length, imported: 0, updated: 0, skippedDuplicates: 0, errors: [],
  };
  if (!format) {
    result.errors.push({
      row: 1,
      reason: "Unbekanntes CSV-Format. Erwartet wird ITMART CSV, Google Places CSV oder Sales Pipeline CSV.",
    });
    return result;
  }
  if (importType === "sales-pipeline" && format !== "sales-pipeline") {
    result.errors.push({ row: 1, reason: "Die Datei ist keine Sales Pipeline CSV." });
    return result;
  }
  if (importType === "markets" && format === "sales-pipeline") {
    result.errors.push({ row: 1, reason: "Bitte den Importtyp Sales Pipeline CSV wählen." });
    return result;
  }
  if (format === "sales-pipeline" && mode !== "insert-only") {
    result.errors.push({ row: 1, reason: "Sales Pipeline CSV wird nur als neue Datensätze importiert." });
    return result;
  }

  const chains = format === "itmart"
    ? await db.select({ id: chainTable.id, name: chainTable.name }).from(chainTable)
    : [];
  const chainByName = new Map(chains.map((chain) => [chain.name.toLowerCase(), chain.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 2;

    if (format === "sales-pipeline") {
      const name = row.company_name?.trim();
      if (!name) {
        result.errors.push({ row: rowNum, reason: "Pflichtfeld fehlt: Company Name" });
        continue;
      }
      const salesStage = mapSalesPipelineStage(row.stage);
      if (!salesStage) {
        result.errors.push({ row: rowNum, reason: `Unbekannte Pipeline-Phase: ${row.stage || "leer"}` });
        continue;
      }

      const expectedVolume = parseSalesPipelineMoney(row["expected_volume_(€)"]);
      if (row["expected_volume_(€)"]?.trim() && expectedVolume == null) {
        result.errors.push({ row: rowNum, reason: "Expected Volume (€) ist ungültig" });
        continue;
      }
      const probability = parseSalesPipelineProbability(row["probability_(%)"]);
      if (row["probability_(%)"]?.trim() && probability == null) {
        result.errors.push({ row: rowNum, reason: "Probability (%) muss zwischen 0 und 100 liegen" });
        continue;
      }
      const dateEntered = parseSalesPipelineDate(row.date_entered);
      if (row.date_entered?.trim() && dateEntered == null) {
        result.errors.push({ row: rowNum, reason: "Date Entered ist ungültig" });
        continue;
      }
      const expectedClose = parseSalesPipelineDate(row.expected_close);
      if (row.expected_close?.trim() && expectedClose == null) {
        result.errors.push({ row: rowNum, reason: "Expected Close ist ungültig" });
        continue;
      }
      const lastActivityAt = parseSalesPipelineDate(row.last_activity);
      if (row.last_activity?.trim() && lastActivityAt == null) {
        result.errors.push({ row: rowNum, reason: "Last Activity ist ungültig" });
        continue;
      }

      try {
        await db.insert(marketTable).values({
          companyId: user.companyId,
          name,
          streetFull: "",
          lat: null,
          lng: null,
          contactPerson: row.contact_name?.trim() || null,
          contactEmail: row.contact_email?.trim() || null,
          contactPhone: row.contact_phone?.trim() || null,
          salesStage,
          expectedVolume: expectedVolume == null ? null : String(expectedVolume),
          probability: probability == null ? null : String(probability),
          leadSource: row.lead_source?.trim() || null,
          clientType: row.type_of_client?.trim() || null,
          channel: row.channel?.trim() || null,
          dateEntered,
          expectedClose,
          lastActivityAt,
          nextAction: row.next_action?.trim() || null,
          importedNotes: row.notes?.trim() || null,
          createdByUserId: user.id,
        });
        result.imported++;
      } catch (error) {
        result.errors.push({ row: rowNum, reason: (error as Error).message || "Unbekannter Fehler" });
      }
      continue;
    }

    if (format === "itmart") {
      const missing = ITMART_REQUIRED.find((key) => !row[key]);
      if (missing) {
        result.errors.push({ row: rowNum, reason: `Pflichtfeld fehlt: ${missing}`, gln: row.gln });
        continue;
      }
      if (!/^[0-9]{13}$/.test(row.gln!)) {
        result.errors.push({ row: rowNum, reason: "GLN muss 13 Ziffern haben", gln: row.gln });
        continue;
      }
      if (!/^[0-9]{5}$/.test(row.postal_code!)) {
        result.errors.push({ row: rowNum, reason: "PLZ muss 5 Ziffern haben", gln: row.gln });
        continue;
      }
      const lat = normalizeDecimal(row.lat);
      const lng = normalizeDecimal(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        result.errors.push({ row: rowNum, reason: "Lat/Lng ungültig", gln: row.gln });
        continue;
      }
      const chainId = chainByName.get(row.chain!.toLowerCase());
      if (!chainId) {
        result.errors.push({ row: rowNum, reason: `Kette unbekannt: ${row.chain}`, gln: row.gln });
        continue;
      }

      try {
        if (mode === "insert-only") {
          try {
            await db.insert(marketTable).values({
              companyId: user.companyId, chainId, name: row.name!, gln: row.gln!,
              streetFull: row.street_full!, postalCode: row.postal_code!, city: row.city!,
              district: row.district || null, lat: lat.toFixed(7), lng: lng.toFixed(7),
              contactPerson: row.contact_person || null, contactPhone: row.contact_phone || null,
              createdByUserId: user.id,
            });
            result.imported++;
          } catch (error) {
            if ((error as { code?: string }).code === "23505") result.skippedDuplicates++;
            else throw error;
          }
        } else {
          const existing = await db.execute<{ id: string }>(sql`
            SELECT id FROM market
            WHERE company_id = ${user.companyId}::uuid AND gln = ${row.gln!}
              AND active = TRUE AND merged_into_id IS NULL
            LIMIT 1
          `);
          if (existing.rows.length > 0) {
            await db.update(marketTable).set({
              chainId, name: row.name!, streetFull: row.street_full!,
              postalCode: row.postal_code!, city: row.city!, district: row.district || null,
              lat: lat.toFixed(7), lng: lng.toFixed(7),
              contactPerson: row.contact_person || null, contactPhone: row.contact_phone || null,
            }).where(sql`${marketTable.id} = ${existing.rows[0]!.id}::uuid AND ${marketTable.companyId} = ${user.companyId}::uuid`);
            result.updated++;
          } else {
            await db.insert(marketTable).values({
              companyId: user.companyId, chainId, name: row.name!, gln: row.gln!,
              streetFull: row.street_full!, postalCode: row.postal_code!, city: row.city!,
              district: row.district || null, lat: lat.toFixed(7), lng: lng.toFixed(7),
              contactPerson: row.contact_person || null, contactPhone: row.contact_phone || null,
              createdByUserId: user.id,
            });
            result.imported++;
          }
        }
      } catch (error) {
        result.errors.push({ row: rowNum, reason: (error as Error).message || "Unbekannter Fehler", gln: row.gln });
      }
      continue;
    }

    const externalId = row.place_id?.trim();
    if (!externalId) {
      result.errors.push({ row: rowNum, reason: "Pflichtfeld fehlt: place_id" });
      continue;
    }
    if (!row.isim) {
      result.errors.push({ row: rowNum, reason: "Pflichtfeld fehlt: isim", externalId });
      continue;
    }
    if (!row.adres) {
      result.errors.push({ row: rowNum, reason: "Pflichtfeld fehlt: adres", externalId });
      continue;
    }
    const lat = normalizeDecimal(row.lat);
    if (!Number.isFinite(lat)) {
      result.errors.push({ row: rowNum, reason: "Latitude ungültig", externalId });
      continue;
    }
    const lng = normalizeDecimal(row.lng);
    if (!Number.isFinite(lng)) {
      result.errors.push({ row: rowNum, reason: "Longitude ungültig", externalId });
      continue;
    }

    try {
      const existing = await db.execute<{ id: string }>(sql`
        SELECT id FROM market
        WHERE company_id = ${user.companyId}::uuid AND external_id = ${externalId}
          AND merged_into_id IS NULL
        LIMIT 1
      `);
      if (existing.rows.length > 0) {
        if (mode === "insert-only") {
          result.skippedDuplicates++;
          continue;
        }
        await db.update(marketTable).set({
          name: row.isim, streetFull: row.adres, district: row.mahalle || null,
          lat: lat.toFixed(7), lng: lng.toFixed(7), contactPhone: row.telefon || null,
          active: row.durum === "OPERATIONAL",
        }).where(sql`${marketTable.id} = ${existing.rows[0]!.id}::uuid AND ${marketTable.companyId} = ${user.companyId}::uuid`);
        result.updated++;
        continue;
      }

      await db.insert(marketTable).values({
        companyId: user.companyId, chainId: null, name: row.isim, gln: null,
        streetFull: row.adres, postalCode: null, city: null, district: row.mahalle || null,
        lat: lat.toFixed(7), lng: lng.toFixed(7), contactPhone: row.telefon || null,
        active: row.durum === "OPERATIONAL", externalId, createdByUserId: user.id,
      });
      result.imported++;
    } catch (error) {
      result.errors.push({
        row: rowNum, reason: (error as Error).message || "Unbekannter Fehler", externalId,
      });
    }
  }

  await db.insert(auditLog).values({
    companyId: user.companyId,
    userId: user.id,
    event: AUDIT_EVENTS.MARKETS_CSV_IMPORTED,
    payload: {
      mode, format, total_rows: result.totalRows, imported: result.imported,
      updated: result.updated, skipped_duplicates: result.skippedDuplicates,
      errors_count: result.errors.length,
    },
  });
  return result;
}

export function buildCsvTemplate(): string {
  const headers = [
    "chain", "name", "gln", "street_full", "postal_code", "city",
    "district", "lat", "lng", "contact_person", "contact_phone",
  ];
  const example = [
    "Edeka", "Edeka Mustermarkt", "4012345678901", "Musterstr. 1",
    "10115", "Berlin", "Mitte", "52.5200000", "13.4050000",
    "Max Mustermann", "030 12345678",
  ];
  return `${headers.join(",")}\n${example.join(",")}\n`;
}
