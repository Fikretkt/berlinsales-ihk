"use client";

// Markt-Anlegen-/Bearbeiten-Formular.
// Bei Anlegen: Dubletten-Warnung anzeigen wenn API similar markets returnt.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { CurrentSolution, CustomerSatisfaction } from "@/lib/db/schema";
import {
  CURRENT_SOLUTION_DISPLAY,
  CUSTOMER_SATISFACTION_DISPLAY,
  CURRENT_SOLUTIONS,
  CUSTOMER_SATISFACTIONS,
} from "@/lib/sales/intelligence";

interface Chain {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

interface SimilarMarket {
  id: string;
  name: string;
  streetFull: string;
  city: string;
}

export interface MarketFormValues {
  chain_id: string;
  name: string;
  gln: string;
  street_full: string;
  postal_code: string;
  city: string;
  district?: string | null;
  lat: number;
  lng: number;
  contact_person?: string | null;
  contact_phone?: string | null;
  assigned_user_id?: string | null;
  current_solution?: CurrentSolution;
  satisfaction?: CustomerSatisfaction;
}

interface Props {
  mode: "create" | "edit";
  initial?: Partial<MarketFormValues>;
  marketId?: string;
}

export function MarketForm({ mode, initial, marketId }: Props) {
  const router = useRouter();
  const [chains, setChains] = useState<Chain[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [form, setForm] = useState<MarketFormValues>({
    chain_id: initial?.chain_id ?? "",
    name: initial?.name ?? "",
    gln: initial?.gln ?? "",
    street_full: initial?.street_full ?? "",
    postal_code: initial?.postal_code ?? "",
    city: initial?.city ?? "Berlin",
    district: initial?.district ?? "",
    lat: initial?.lat ?? 52.52,
    lng: initial?.lng ?? 13.405,
    contact_person: initial?.contact_person ?? "",
    contact_phone: initial?.contact_phone ?? "",
    assigned_user_id: initial?.assigned_user_id ?? "",
    current_solution: initial?.current_solution ?? "unbekannt",
    satisfaction: initial?.satisfaction ?? "unbekannt",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [similar, setSimilar] = useState<SimilarMarket[] | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/chains", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setChains(j.data?.items ?? []))
      .catch(() => null);

    fetch("/api/v1/admin/users", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setUsers((j.data?.items ?? []).filter((u: UserOption) => u.active)))
      .catch(() => null);
  }, []);

  function set<K extends keyof MarketFormValues>(k: K, v: MarketFormValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSimilar(null);

    if (mode === "create" && !/^[0-9]{13}$/.test(form.gln)) {
      setError("GLN muss genau 13 Ziffern haben.");
      return;
    }

    setSubmitting(true);
    try {
      const url =
        mode === "create"
          ? "/api/v1/markets"
          : `/api/v1/markets/${marketId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      // Bei PATCH nur Änderungen senden — hier vereinfacht: alle Felder mitschicken
      const payload =
        mode === "create"
          ? {
              ...form,
              lat: Number(form.lat),
              lng: Number(form.lng),
              district: form.district || null,
              contact_person: form.contact_person || null,
              contact_phone: form.contact_phone || null,
              assigned_user_id: form.assigned_user_id || null,
              current_solution: form.current_solution || "unbekannt",
              satisfaction: form.satisfaction || "unbekannt",
            }
          : {
              chain_id: form.chain_id,
              name: form.name,
              street_full: form.street_full,
              postal_code: form.postal_code,
              city: form.city,
              district: form.district || null,
              lat: Number(form.lat),
              lng: Number(form.lng),
              contact_person: form.contact_person || null,
              contact_phone: form.contact_phone || null,
              assigned_user_id: form.assigned_user_id || null,
              current_solution: form.current_solution || "unbekannt",
              satisfaction: form.satisfaction || "unbekannt",
            };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Speichern fehlgeschlagen");
        return;
      }
      if (mode === "create" && json.data?.warning?.similarMarkets) {
        setSimilar(json.data.warning.similarMarkets as SimilarMarket[]);
        // Wir lassen den User entscheiden, ob er trotzdem weiter will
        // (Markt wurde aber schon angelegt)
        setTimeout(() => {
          router.push(`/admin/markets/${json.data.market_id}`);
          router.refresh();
        }, 3_000);
        return;
      }
      router.push(mode === "create" ? `/admin/markets/${json.data.market_id}` : "/admin/markets");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Name" required>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          required
          maxLength={200}
          className="form-input"
        />
      </Field>
      <Field label="Kette" required>
        <select
          value={form.chain_id}
          onChange={(e) => set("chain_id", e.target.value)}
          required
          className="form-input"
        >
          <option value="">Bitte wählen …</option>
          {chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="GLN" required hint="13 Ziffern, eindeutig pro Markt-Standort">
        <input
          value={form.gln}
          onChange={(e) => set("gln", e.target.value.replace(/\D/g, "").slice(0, 13))}
          required
          pattern="[0-9]{13}"
          disabled={mode === "edit"}
          className="form-input font-mono disabled:bg-gray-50 disabled:text-gray-500"
        />
      </Field>
      <Field label="Adresse (Straße + Nr)" required>
        <input
          value={form.street_full}
          onChange={(e) => set("street_full", e.target.value)}
          required
          maxLength={250}
          className="form-input"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="PLZ" required>
          <input
            value={form.postal_code}
            onChange={(e) => set("postal_code", e.target.value.replace(/\D/g, "").slice(0, 5))}
            required
            pattern="[0-9]{5}"
            inputMode="numeric"
            className="form-input"
          />
        </Field>
        <Field label="Ort" required>
          <input
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            required
            className="form-input"
          />
        </Field>
      </div>
      <Field label="Bezirk (optional)">
        <input
          value={form.district ?? ""}
          onChange={(e) => set("district", e.target.value)}
          maxLength={100}
          className="form-input"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Breitengrad (Lat)" required hint="z. B. 52.5200000">
          <input
            type="number"
            step="0.0000001"
            value={form.lat}
            onChange={(e) => set("lat", parseFloat(e.target.value))}
            required
            className="form-input"
          />
        </Field>
        <Field label="Längengrad (Lng)" required hint="z. B. 13.4050000">
          <input
            type="number"
            step="0.0000001"
            value={form.lng}
            onChange={(e) => set("lng", parseFloat(e.target.value))}
            required
            className="form-input"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Ansprechpartner">
          <input
            value={form.contact_person ?? ""}
            onChange={(e) => set("contact_person", e.target.value)}
            maxLength={200}
            className="form-input"
          />
        </Field>
        <Field label="Telefon">
          <input
            value={form.contact_phone ?? ""}
            onChange={(e) => set("contact_phone", e.target.value)}
            maxLength={50}
            className="form-input"
          />
        </Field>
      </div>

      <Field label="Zugewiesener Mitarbeiter (optional)">
        <select
          value={form.assigned_user_id ?? ""}
          onChange={(e) => set("assigned_user_id", e.target.value || null)}
          className="form-input"
        >
          <option value="">Keinem Mitarbeiter zugewiesen</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Aktuelle Lösung">
          <select
            value={form.current_solution ?? "unbekannt"}
            onChange={(e) => set("current_solution", e.target.value as CurrentSolution)}
            className="form-input"
          >
            {CURRENT_SOLUTIONS.map((sol) => (
              <option key={sol} value={sol}>
                {CURRENT_SOLUTION_DISPLAY[sol].label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Zufriedenheit">
          <select
            value={form.satisfaction ?? "unbekannt"}
            onChange={(e) => set("satisfaction", e.target.value as CustomerSatisfaction)}
            className="form-input"
          >
            {CUSTOMER_SATISFACTIONS.map((sat) => (
              <option key={sat} value={sat}>
                {CUSTOMER_SATISFACTION_DISPLAY[sat].label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {similar && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Markt wurde angelegt — aber Achtung:</p>
              <p className="mt-1 text-sm">
                Es gibt schon ähnliche Märkte in der gleichen PLZ. Wenn das ein Duplikat ist,
                kannst du sie über die Markt-Liste zusammenführen.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {similar.map((s) => (
                  <li key={s.id}>
                    • {s.name} — {s.streetFull}, {s.city}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-800">Du wirst gleich weitergeleitet …</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm"
        >
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="min-h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Speichert …" : mode === "create" ? "Anlegen" : "Speichern"}
        </button>
      </div>

      <style jsx>{`
        :global(.form-input) {
          display: block;
          width: 100%;
          min-height: 2.75rem;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          padding: 0 0.75rem;
          font-size: 0.875rem;
        }
        :global(.form-input:focus) {
          outline: 2px solid transparent;
          border-color: #22c55e;
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.5);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
