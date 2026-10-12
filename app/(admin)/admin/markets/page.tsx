"use client";

// Admin: Markt-Übersicht mit Filter, Aktiv/Inaktiv-Toggle, Merge-Workflow.

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Power, GitMerge } from "lucide-react";

interface AdminMarketItem {
  id: string;
  name: string;
  gln: string | null;
  chainName: string | null;
  city: string | null;
  postalCode: string | null;
  district: string | null;
  streetFull: string;
  active: boolean;
  mergedIntoId: string | null;
  createdAt: string;
  createdByName: string | null;
}

interface ListResponse {
  items: AdminMarketItem[];
  total: number;
}

async function fetchAdminMarkets(opts: {
  search?: string;
  includeInactive?: boolean;
}): Promise<ListResponse> {
  const params = new URLSearchParams();
  if (opts.search) params.set("search", opts.search);
  if (opts.includeInactive) params.set("include_inactive", "true");
  params.set("limit", "100");
  const res = await fetch(`/api/v1/admin/markets?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Fehler beim Laden");
  return (await res.json()).data;
}

export default function AdminMarketsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<string[]>([]);
  const [mergeDialog, setMergeDialog] = useState<null | {
    primary: AdminMarketItem;
    duplicate: AdminMarketItem;
  }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-markets", search, includeInactive],
    queryFn: () => fetchAdminMarkets({ search, includeInactive }),
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  function toggleMergeSelect(id: string) {
    setMergeSelected((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : curr.length < 2 ? [...curr, id] : curr,
    );
  }

  function startMerge() {
    if (mergeSelected.length !== 2 || !data) return;
    const a = data.items.find((m) => m.id === mergeSelected[0]);
    const b = data.items.find((m) => m.id === mergeSelected[1]);
    if (a && b) setMergeDialog({ primary: a, duplicate: b });
  }

  async function executeMerge() {
    if (!mergeDialog) return;
    const res = await fetch("/api/v1/admin/markets/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        primary_id: mergeDialog.primary.id,
        duplicate_id: mergeDialog.duplicate.id,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error?.message ?? "Merge fehlgeschlagen");
      return;
    }
    alert(
      `Zusammengeführt. ${json.data.notes_moved} Notizen, ${json.data.actions_moved} Aktionen, ${json.data.reservations_cancelled} Reservierungen umgehängt.`,
    );
    setMergeDialog(null);
    setMergeSelected([]);
    qc.invalidateQueries({ queryKey: ["admin-markets"] });
  }

  async function toggleActive(market: AdminMarketItem) {
    const url = market.active
      ? `/api/v1/markets/${market.id}/deactivate`
      : `/api/v1/markets/${market.id}/reactivate`;
    const verb = market.active ? "deaktivieren" : "reaktivieren";
    if (!confirm(`Markt "${market.name}" wirklich ${verb}?`)) return;
    const res = await fetch(url, { method: "POST", credentials: "include" });
    if (!res.ok) {
      const j = await res.json();
      alert(j.error?.message ?? "Fehler");
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin-markets"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Märkte verwalten</h1>
        <Link
          href="/admin/markets/new"
          className="flex min-h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700"
        >
          <Plus className="h-4 w-4" /> Neuen Markt anlegen
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="relative flex-1 min-w-60"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Suche: Name, GLN, Adresse"
            className="block w-full min-h-10 rounded-lg border border-gray-300 pl-9 pr-3 text-sm"
          />
        </form>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-4 w-4"
          />
          Auch inaktive zeigen
        </label>
        {mergeSelected.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1 text-sm text-blue-700">
            <span>{mergeSelected.length}/2 für Merge ausgewählt</span>
            {mergeSelected.length === 2 && (
              <button
                onClick={startMerge}
                className="flex min-h-8 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white"
              >
                <GitMerge className="h-3 w-3" /> Zusammenführen
              </button>
            )}
            <button
              onClick={() => setMergeSelected([])}
              className="text-xs text-blue-700 underline"
            >
              abbrechen
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-3 py-3" />
              <th className="px-3 py-3 text-left">Name</th>
              <th className="px-3 py-3 text-left">Kette</th>
              <th className="px-3 py-3 text-left">Adresse</th>
              <th className="px-3 py-3 text-left">GLN</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">
                  Lädt …
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">
                  Keine Märkte gefunden.
                </td>
              </tr>
            )}
            {data?.items.map((m) => (
              <tr key={m.id} className={!m.active ? "bg-gray-50" : undefined}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={mergeSelected.includes(m.id)}
                    onChange={() => toggleMergeSelect(m.id)}
                    disabled={!m.active}
                    aria-label="Für Merge auswählen"
                    className="h-4 w-4"
                  />
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/markets/${m.id}`}
                    className="font-medium text-gray-900 hover:text-green-700"
                  >
                    {m.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600">{m.chainName}</td>
                <td className="px-3 py-2 text-gray-600">
                  {m.streetFull || [m.postalCode, m.city].filter(Boolean).join(" ") || "Adresse nicht importiert"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{m.gln}</td>
                <td className="px-3 py-2">
                  {m.mergedIntoId ? (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                      gemergt
                    </span>
                  ) : m.active ? (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      aktiv
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      inaktiv
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {!m.mergedIntoId && (
                    <button
                      onClick={() => toggleActive(m)}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      title={m.active ? "Deaktivieren" : "Reaktivieren"}
                    >
                      <Power className="h-3 w-3" />
                      {m.active ? "deaktivieren" : "reaktivieren"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && (
          <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
            {data.items.length} von {data.total} Märkten
          </div>
        )}
      </div>

      {/* Merge-Bestätigungs-Dialog */}
      {mergeDialog && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">Zwei Märkte zusammenführen</h2>
            <p className="mt-2 text-sm text-gray-600">
              Du kannst nicht rückgängig machen, was du gleich gleich machst.
            </p>

            <div className="mt-4 space-y-3">
              <p className="text-sm">
                <strong>Hauptdatensatz:</strong> <br />
                {mergeDialog.primary.name}
                <span className="block text-xs text-gray-500">
                  {mergeDialog.primary.streetFull}, {mergeDialog.primary.city}
                </span>
              </p>
              <p className="text-sm">
                <strong>Wird zusammengeführt mit:</strong> <br />
                {mergeDialog.duplicate.name}
                <span className="block text-xs text-gray-500">
                  {mergeDialog.duplicate.streetFull}, {mergeDialog.duplicate.city}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                Notizen und Aktionen des zweiten Markts werden zum ersten umgehängt. Der zweite
                Markt wird deaktiviert und ist nicht mehr anwählbar.
              </p>
            </div>

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => {
                  // Hauptdatensatz wechseln
                  setMergeDialog({
                    primary: mergeDialog.duplicate,
                    duplicate: mergeDialog.primary,
                  });
                }}
                className="text-sm text-gray-600 underline"
              >
                Reihenfolge tauschen
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setMergeDialog(null)}
                  className="min-h-10 rounded-lg border border-gray-300 px-3 text-sm"
                >
                  Abbrechen
                </button>
                <button
                  onClick={executeMerge}
                  className="min-h-10 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white"
                >
                  Endgültig zusammenführen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
