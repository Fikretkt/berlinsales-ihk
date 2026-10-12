"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Inbox } from "lucide-react";
import { formatBerlinDateTime } from "@/lib/markets/status-display";

interface ConflictReport {
  report_id: string;
  created_at: string;
  market: { id: string; name: string };
  reporter: { user_id: string; name: string };
  intended_type: string;
  conflict: Record<string, unknown>;
  client_timestamp: string;
  user_comment: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolution_note: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  visit: "Besuch",
  profi_visit: "Persönliches Gespräch",
  delivery: "Lieferung",
  control: "Kontrolle",
  cancel_order: "Stornierung",
  manual_override: "Manueller Override",
};

async function fetchReports(filter: "open" | "resolved" | "all"): Promise<ConflictReport[]> {
  const param = filter === "open" ? "false" : filter === "resolved" ? "true" : "all";
  const res = await fetch(`/api/v1/admin/conflict-reports?resolved=${param}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Fehler");
  return (await res.json()).data.items;
}

export default function ConflictsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [resolveDialog, setResolveDialog] = useState<ConflictReport | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["conflict-reports", filter],
    queryFn: () => fetchReports(filter),
  });

  async function resolve() {
    if (!resolveDialog) return;
    const res = await fetch(
      `/api/v1/admin/conflict-reports/${resolveDialog.report_id}/resolve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ resolution_note: note.trim() || undefined }),
      },
    );
    if (!res.ok) {
      const j = await res.json();
      alert(j.error?.message ?? "Fehler");
      return;
    }
    setResolveDialog(null);
    setNote("");
    qc.invalidateQueries({ queryKey: ["conflict-reports"] });
  }

  function describeConflict(c: Record<string, unknown>): string {
    if (c.code === "MARKET_MERGED") return "Markt wurde inzwischen mit einem anderen zusammengeführt";
    if (c.code === "MARKET_INACTIVE") return "Markt wurde inzwischen deaktiviert";
    if (c.code === "USER_DEACTIVATED") return "Der User wurde inzwischen deaktiviert";
    if (c.code === "MARKET_IN_COOLDOWN") return "Markt war im Cooldown";
    if (c.expected_statuses && c.actual_status) {
      return `Erwartet: ${(c.expected_statuses as string[]).join(" / ")} → tatsächlich: ${c.actual_status}`;
    }
    return JSON.stringify(c);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Konflikt-Berichte</h1>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <FilterBtn active={filter === "open"} onClick={() => setFilter("open")}>Offen</FilterBtn>
        <FilterBtn active={filter === "resolved"} onClick={() => setFilter("resolved")}>Erledigt</FilterBtn>
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>Alle</FilterBtn>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-gray-500">Lädt …</p>}
        {data?.length === 0 && (
          <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
            <Inbox className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            Keine {filter === "open" ? "offenen " : ""}Konflikt-Berichte.
          </div>
        )}
        {data?.map((r) => (
          <div
            key={r.report_id}
            className={`rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200 ${r.resolved ? "opacity-70" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <strong>{r.reporter.name}</strong>
                  <span className="text-gray-500">wollte</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono">
                    {TYPE_LABELS[r.intended_type] ?? r.intended_type}
                  </span>
                  <span className="text-gray-500">bei</span>
                  <Link
                    href={`/admin/markets/${r.market.id}`}
                    className="font-medium text-green-700 hover:underline"
                  >
                    {r.market.name}
                  </Link>
                </div>
                <p className="mt-1 text-sm text-amber-700">
                  Konflikt: {describeConflict(r.conflict)}
                </p>
                {r.user_comment && (
                  <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm italic text-gray-700">
                    &bdquo;{r.user_comment}&ldquo;
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  Erfasst {formatBerlinDateTime(r.client_timestamp)} ·
                  gemeldet {formatBerlinDateTime(r.created_at)}
                </p>
                {r.resolved && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Erledigt {r.resolved_at && formatBerlinDateTime(r.resolved_at)}
                    {r.resolution_note && ` — „${r.resolution_note}“`}
                  </p>
                )}
              </div>
              {!r.resolved && (
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/markets/${r.market.id}`}
                    className="inline-flex min-h-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    Markt öffnen
                  </Link>
                  <button
                    onClick={() => setResolveDialog(r)}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Als erledigt
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {resolveDialog && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">Bericht als erledigt markieren</h2>
            <p className="mt-1 text-sm text-gray-600">
              Optional: Notiz, was du gemacht hast (z. B. &bdquo;Override
              durchgef&uuml;hrt&ldquo; oder &bdquo;mit Kollegen gekl&auml;rt&ldquo;).
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-3 block w-full rounded-lg border border-gray-300 p-2 text-sm"
              placeholder="Notiz (optional)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setResolveDialog(null);
                  setNote("");
                }}
                className="min-h-10 rounded-lg border border-gray-300 px-4 text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={resolve}
                className="min-h-10 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white"
              >
                Als erledigt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/50"
      }`}
    >
      {children}
    </button>
  );
}
