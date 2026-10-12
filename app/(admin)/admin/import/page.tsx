"use client";

import { useState } from "react";
import { Upload, Download, CheckCircle2, AlertTriangle } from "lucide-react";

interface ImportResult {
  import_type?: "markets" | "sales-pipeline" | null;
  mode: string;
  total_rows: number;
  imported: number;
  updated: number;
  skipped_duplicates: number;
  errors: { row: number; reason: string; gln?: string; externalId?: string }[];
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<"markets" | "sales-pipeline">("sales-pipeline");
  const [detectedFormat, setDetectedFormat] = useState<"ITMART" | "Google Places" | "Sales Pipeline" | null>(null);
  const [mode, setMode] = useState<"insert-only" | "upsert">("insert-only");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", importType === "sales-pipeline" ? "insert-only" : mode);
      fd.append("import_type", importType);
      const res = await fetch("/api/v1/admin/markets/import-csv", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Import fehlgeschlagen");
        return;
      }
      setResult(json.data as ImportResult);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Kunden aus CSV importieren</h1>

      <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
        Sales Pipeline CSV aus Excel wird als UTF-8 CSV importiert; Komma und Semikolon werden erkannt. Bestehende ITMART- und Google-Places-Importe bleiben verfügbar.
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        {importType === "markets" && (
          <a
            href="/api/v1/admin/markets/import-csv/template"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Vorlage herunterladen
          </a>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="import-type" className="block text-sm font-medium text-gray-700">Importtyp</label>
            <select
              id="import-type"
              value={importType}
              onChange={(event) => {
                setImportType(event.target.value as "markets" | "sales-pipeline");
                setResult(null);
                setError(null);
              }}
              className="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="sales-pipeline">Sales Pipeline CSV (Excel)</option>
              <option value="markets">ITMART / Google Places CSV</option>
            </select>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700">CSV-Datei</p>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const selectedFile = e.target.files?.[0] ?? null;
                setFile(selectedFile);
                if (!selectedFile) {
                  setDetectedFormat(null);
                  return;
                }
                const header = (await selectedFile.text()).split(/\r?\n/, 1)[0]
                  ?.replace(/^\uFEFF/, "").toLowerCase() ?? "";
                setDetectedFormat(header.includes("company name") && header.includes("stage")
                  ? "Sales Pipeline"
                  : header.includes("place_id") && header.includes("isim")
                  ? "Google Places"
                  : header.includes("chain") && header.includes("gln") ? "ITMART" : null);
              }}
              className="sr-only"
            />
            <label
              htmlFor="csv-file"
              className="mt-2 flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-100 focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
                <Upload className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-blue-950">CSV-Datei auswählen</span>
                <span className="mt-0.5 block text-xs text-blue-800">.csv · UTF-8</span>
              </span>
            </label>
            {file && (
              <p className="mt-1 text-xs text-gray-500">{file.name} · {(file.size / 1024).toFixed(1)} KB</p>
            )}
            {file && detectedFormat && (
              <p className="mt-1 text-xs font-medium text-blue-800">Format erkannt: {detectedFormat}</p>
            )}
          </div>

          {importType === "sales-pipeline" ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              Jede gültige Zeile wird als neuer Pipeline-Kunde angelegt. Es gibt keinen Ersetzen-Modus.
            </p>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700">Modus</label>
              <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  value="insert-only"
                  checked={mode === "insert-only"}
                  onChange={() => setMode("insert-only")}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Nur neue Märkte anlegen</p>
                  <p className="text-xs text-gray-500">
                    Bei GLN-Konflikt wird die Zeile übersprungen. Sicher für Erst-Befüllung.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <input
                  type="radio"
                  value="upsert"
                  checked={mode === "upsert"}
                  onChange={() => setMode("upsert")}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">Bestehende über GLN aktualisieren</p>
                  <p className="text-xs text-gray-500">
                    Bei bekannter GLN wird der Datensatz überschrieben. Für regelmäßige Daten-Pflege.
                  </p>
                </div>
              </label>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={!file || running}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {running ? "Importiere …" : "Import starten"}
          </button>
        </div>
      </div>

      {result && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="font-semibold">Import fertig</h2>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Gesamt" value={result.total_rows} />
            <Stat label="Importiert" value={result.imported} tone="green" />
            <Stat label="Aktualisiert" value={result.updated} tone="blue" />
            <Stat label="Übersprungen" value={result.skipped_duplicates} tone="gray" />
            <Stat label="Fehler" value={result.errors.length} tone="gray" />
          </dl>

          {result.errors.length > 0 && (
            <div className="mt-4 rounded-lg bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-medium">{result.errors.length} Zeilen mit Fehlern</p>
              </div>
              <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-xs text-amber-900">
                {result.errors.slice(0, 50).map((e) => (
                  <li key={e.row}>
                    Zeile {e.row}: {e.reason} {e.gln && `(GLN ${e.gln})`}{e.externalId && ` (Place ID ${e.externalId})`}
                  </li>
                ))}
                {result.errors.length > 50 && (
                  <li>… und {result.errors.length - 50} weitere</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "blue" | "gray";
}) {
  const colors: Record<string, string> = {
    green: "bg-green-50 text-green-700",
    blue: "bg-blue-50 text-blue-700",
    gray: "bg-gray-50 text-gray-600",
  };
  return (
    <div className={`rounded-lg px-3 py-2 ${tone ? colors[tone] : "bg-gray-50 text-gray-700"}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
