"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar, AlertTriangle, Sparkles } from "lucide-react";
import { formatBerlinDateTime } from "@/lib/markets/status-display";

interface Overview {
  visits: { total: number; successful: number; escalated: number; declined: number };
  deliveries: number;
  controls: { ok: number; problem: number };
  cancellations: number;
  manualOverrides: number;
  totalActions: number;
}

interface StaleMarket {
  marketId: string;
  marketName: string;
  city: string;
  chainName: string;
  reason: "rosa_14d" | "gelb_21d" | "untouched_45d";
  status: string;
  lastActionAt: string | null;
}

interface NewMarket {
  marketId: string;
  name: string;
  gln: string;
  chainName: string;
  city: string;
  streetFull: string;
  createdAt: string;
  daysAgo: number;
  createdByName: string | null;
  similarCount: number;
}

const REASON_LABELS: Record<StaleMarket["reason"], string> = {
  rosa_14d: "Rosa seit >14 Tagen",
  gelb_21d: "Gelb seit >21 Tagen",
  untouched_45d: "Keine Aktivität >45 Tage",
};

export default function ReportsPage() {
  const [tab, setTab] = useState<"overview" | "stale" | "new">("overview");

  // Aktuelle Woche (Mo bis jetzt)
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  const overview = useQuery({
    queryKey: ["report-overview", weekStart.toISOString()],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/reports/overview?from=${encodeURIComponent(weekStart.toISOString())}&to=${encodeURIComponent(now.toISOString())}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Fehler");
      return (await res.json()).data as Overview;
    },
    enabled: tab === "overview",
  });

  const stale = useQuery({
    queryKey: ["report-stale"],
    queryFn: async () => {
      const res = await fetch("/api/v1/reports/stale-markets", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Fehler");
      return (await res.json()).data.items as StaleMarket[];
    },
    enabled: tab === "stale",
  });

  const fresh = useQuery({
    queryKey: ["report-new"],
    queryFn: async () => {
      const res = await fetch("/api/v1/reports/new-markets?days=30", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Fehler");
      return (await res.json()).data.items as NewMarket[];
    },
    enabled: tab === "new",
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reporting</h1>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} icon={<Calendar className="h-4 w-4" />}>
          Wochenübersicht
        </TabBtn>
        <TabBtn active={tab === "stale"} onClick={() => setTab("stale")} icon={<AlertTriangle className="h-4 w-4" />}>
          Hänger-Liste
        </TabBtn>
        <TabBtn active={tab === "new"} onClick={() => setTab("new")} icon={<Sparkles className="h-4 w-4" />}>
          Neue Märkte
        </TabBtn>
      </div>

      {tab === "overview" && (
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-3 text-sm text-gray-500">
            Seit {weekStart.toLocaleDateString("de-DE")} bis jetzt
          </p>
          {overview.isLoading && <p className="text-gray-500">Lädt …</p>}
          {overview.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Aktionen gesamt" value={overview.data.totalActions} />
              <Stat label="Besuche" value={overview.data.visits.total} />
              <Stat label="Erfolgreich" value={overview.data.visits.successful} tone="green" />
              <Stat label="Eskaliert" value={overview.data.visits.escalated} tone="pink" />
              <Stat label="Lieferungen" value={overview.data.deliveries} tone="orange" />
              <Stat label="Kontrollen okay" value={overview.data.controls.ok} tone="green" />
              <Stat label="Kontrollen Problem" value={overview.data.controls.problem} tone="amber" />
              <Stat label="Stornos" value={overview.data.cancellations} tone="gray" />
            </div>
          )}
        </div>
      )}

      {tab === "stale" && (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-3 text-left">Markt</th>
                <th className="px-3 py-3 text-left">Kette</th>
                <th className="px-3 py-3 text-left">Stadt</th>
                <th className="px-3 py-3 text-left">Grund</th>
                <th className="px-3 py-3 text-left">Letzte Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stale.isLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                    Lädt …
                  </td>
                </tr>
              )}
              {stale.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                    Keine Hänger. Top!
                  </td>
                </tr>
              )}
              {stale.data?.map((m) => (
                <tr key={m.marketId}>
                  <td className="px-3 py-2">
                    <Link href={`/markets/${m.marketId}`} className="font-medium hover:text-green-700">
                      {m.marketName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{m.chainName}</td>
                  <td className="px-3 py-2 text-gray-600">{m.city}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {REASON_LABELS[m.reason]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {m.lastActionAt ? formatBerlinDateTime(m.lastActionAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "new" && (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-3 text-left">Markt</th>
                <th className="px-3 py-3 text-left">Adresse</th>
                <th className="px-3 py-3 text-left">Angelegt von</th>
                <th className="px-3 py-3 text-left">Vor</th>
                <th className="px-3 py-3 text-left">Ähnliche Märkte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fresh.isLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">Lädt …</td>
                </tr>
              )}
              {fresh.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                    Keine neuen Märkte in den letzten 30 Tagen.
                  </td>
                </tr>
              )}
              {fresh.data?.map((m) => (
                <tr key={m.marketId}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/markets/${m.marketId}`} className="font-medium hover:text-green-700">
                      {m.name}
                    </Link>
                    <span className="ml-2 text-xs text-gray-400">{m.chainName}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{m.streetFull}, {m.city}</td>
                  <td className="px-3 py-2 text-gray-600">{m.createdByName ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{m.daysAgo} Tagen</td>
                  <td className="px-3 py-2">
                    {m.similarCount > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {m.similarCount} ähnliche
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white/50"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "orange" | "pink" | "amber" | "gray";
}) {
  const colors: Record<string, string> = {
    green: "bg-green-50 text-green-700",
    orange: "bg-orange-50 text-orange-700",
    pink: "bg-pink-50 text-pink-700",
    amber: "bg-amber-50 text-amber-700",
    gray: "bg-gray-50 text-gray-600",
  };
  return (
    <div className={`rounded-lg px-3 py-2 ${tone ? colors[tone] : "bg-gray-50 text-gray-700"}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
