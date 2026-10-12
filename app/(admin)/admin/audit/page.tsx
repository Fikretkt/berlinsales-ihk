"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, ChevronDown, ChevronRight } from "lucide-react";
import { formatBerlinDateTime } from "@/lib/markets/status-display";

interface AuditEntry {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  created_at: string;
  user: { id: string; name: string | null } | null;
}

interface AuditResponse {
  items: AuditEntry[];
  total: number;
  available_events: string[];
}

const EVENT_LABELS: Record<string, string> = {
  user_invited: "Benutzer eingeladen",
  user_invited_email_failed: "Einladungs-Mail fehlgeschlagen",
  user_invitation_resent: "Einladung erneut gesendet",
  user_activated: "Benutzer aktiviert",
  user_deactivated: "Benutzer deaktiviert",
  user_role_changed: "Rolle geändert",
  market_created: "Markt angelegt",
  market_updated: "Markt bearbeitet",
  market_deactivated: "Markt deaktiviert",
  market_reactivated: "Markt reaktiviert",
  market_merged: "Märkte zusammengeführt",
  markets_csv_imported: "CSV importiert",
  cooldown_rule_changed: "Cooldown-Regel geändert",
  chain_created: "Kette angelegt",
  chain_deactivated: "Kette deaktiviert",
  manual_override_performed: "Status manuell überschrieben",
  reservation_cancelled_by_admin: "Reservierung aufgehoben",
  geo_anonymization_run: "Geo-Anonymisierung gelaufen",
  offline_conflict_reported: "Konflikt gemeldet (Field User)",
  offline_conflict_resolved: "Konflikt erledigt (Admin)",
  action_undone: "Aktion zurückgenommen",
};

async function fetchAudit(filters: {
  event?: string;
  from?: string;
  to?: string;
  offset?: number;
}): Promise<AuditResponse> {
  const params = new URLSearchParams();
  if (filters.event) params.set("event", filters.event);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("limit", "50");
  if (filters.offset) params.set("offset", String(filters.offset));
  const res = await fetch(`/api/v1/admin/audit-log?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Fehler");
  return (await res.json()).data;
}

export default function AuditPage() {
  const [eventFilter, setEventFilter] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["audit", eventFilter, from, to, offset],
    queryFn: () =>
      fetchAudit({
        event: eventFilter || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
        offset,
      }),
  });

  function toggle(id: string) {
    setExpanded((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Audit-Log</h1>
        <p className="text-sm text-gray-500">
          Vollständige Compliance-Spur aller wichtigen Aktionen.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-3 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-col">
          <label className="mb-1 text-xs font-medium text-gray-700">Ereignis-Typ</label>
          <select
            value={eventFilter}
            onChange={(e) => {
              setEventFilter(e.target.value);
              setOffset(0);
            }}
            className="min-h-10 rounded-lg border border-gray-300 px-2 text-sm"
          >
            <option value="">Alle</option>
            {data?.available_events.map((e) => (
              <option key={e} value={e}>
                {EVENT_LABELS[e] ?? e}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs font-medium text-gray-700">Von</label>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setOffset(0);
            }}
            className="min-h-10 rounded-lg border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs font-medium text-gray-700">Bis</label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setOffset(0);
            }}
            className="min-h-10 rounded-lg border border-gray-300 px-2 text-sm"
          />
        </div>
        {(eventFilter || from || to) && (
          <button
            onClick={() => {
              setEventFilter("");
              setFrom("");
              setTo("");
              setOffset(0);
            }}
            className="min-h-10 rounded-lg border border-gray-300 px-3 text-sm"
          >
            Filter zurücksetzen
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <Filter className="h-3 w-3" />
          {data ? `${data.total} Einträge` : "…"}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-3 text-left">Zeit</th>
              <th className="px-3 py-3 text-left">Ereignis</th>
              <th className="px-3 py-3 text-left">Benutzer</th>
              <th className="px-3 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                  Lädt …
                </td>
              </tr>
            )}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                  Keine Einträge.
                </td>
              </tr>
            )}
            {data?.items.map((e) => (
              <>
                <tr key={e.id} className="cursor-pointer hover:bg-gray-50" onClick={() => toggle(e.id)}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                    {formatBerlinDateTime(e.created_at)}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900">
                    {EVENT_LABELS[e.event] ?? e.event}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{e.user?.name ?? "System"}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {expanded.has(e.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                </tr>
                {expanded.has(e.id) && (
                  <tr key={`${e.id}-detail`} className="bg-gray-50">
                    <td colSpan={4} className="px-3 py-3">
                      <pre className="max-h-60 overflow-auto rounded bg-white p-3 text-xs ring-1 ring-gray-200">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {data && data.total > 50 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
            <span>
              {offset + 1}–{Math.min(offset + 50, data.total)} von {data.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - 50))}
                disabled={offset === 0}
                className="min-h-8 rounded-lg border border-gray-300 px-3 disabled:opacity-50"
              >
                Vorherige
              </button>
              <button
                onClick={() => setOffset(offset + 50)}
                disabled={offset + 50 >= data.total}
                className="min-h-8 rounded-lg border border-gray-300 px-3 disabled:opacity-50"
              >
                Nächste
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
