"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Phone,
  MapPin,
  Trophy,
  XCircle,
  Percent,
  Clock,
  Euro,
  Users,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  PieChart,
  ThumbsUp,
  CreditCard,
} from "lucide-react";
import type {
  ManagementPeriodKey,
  ManagementDashboardData,
} from "@/lib/dashboard/management-types";
import {
  SALES_STAGE_DISPLAY,
  INTEREST_LEVEL_DISPLAY,
  formatEuro,
} from "@/lib/sales/display";
import {
  CURRENT_SOLUTION_DISPLAY,
  CUSTOMER_SATISFACTION_DISPLAY,
} from "@/lib/sales/intelligence";
import type {
  SalesStage,
  CurrentSolution,
  CustomerSatisfaction,
  InterestLevel,
} from "@/lib/db/schema";

const PERIOD_OPTIONS: { key: ManagementPeriodKey; label: string }[] = [
  { key: "today", label: "Heute" },
  { key: "week", label: "Diese Woche" },
  { key: "month", label: "Dieser Monat" },
  { key: "30d", label: "Letzte 30 Tage" },
];

const PIPELINE_ORDER: SalesStage[] = [
  "neu",
  "kontaktiert",
  "interesse",
  "angebot",
  "gewonnen",
  "verloren",
];

const SOLUTION_ORDER: CurrentSolution[] = [
  "sumup",
  "zettle",
  "verifone",
  "ingenico",
  "keine",
  "andere",
  "unbekannt",
];

const SATISFACTION_ORDER: CustomerSatisfaction[] = [
  "zufrieden",
  "neutral",
  "unzufrieden",
  "unbekannt",
];

const INTEREST_ORDER: InterestLevel[] = [
  "hoch",
  "mittel",
  "niedrig",
  "kein_interesse",
];

export default function ManagementDashboardPage() {
  const [period, setPeriod] = useState<ManagementPeriodKey>("week");

  const { data, isLoading, error, refetch } = useQuery<ManagementDashboardData>({
    queryKey: ["admin-management-dashboard", period],
    queryFn: async () => {
      const res = await fetch(`/api/v1/admin/dashboard?period=${period}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Fehler beim Laden des Management-Dashboards");
      }
      const json = await res.json();
      return json.data as ManagementDashboardData;
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
          <p className="mt-2 text-sm text-gray-500">Lade Management-Dashboard …</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
        <h2 className="mt-2 text-base font-semibold text-red-900">
          Fehler beim Laden des Dashboards
        </h2>
        <p className="mt-1 text-sm text-red-700">
          Die Vertriebsdaten konnten nicht geladen werden.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  const totalPipeline = Object.values(data.pipeline).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Period Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Vertriebs-Dashboard
            </h1>
            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
              Management
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Unternehmensweite Performance, Pipeline-Fluss und Kundenanalysen
          </p>
        </div>

        {/* Time-Range Selector */}
        <div className="inline-flex rounded-xl bg-gray-100 p-1 shadow-inner">
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriod(opt.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Top Operational KPIs */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Aktivität & Abschlüsse
            </span>
            <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              Zeitraum: {data.period.label}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <KpiCard
            icon={<Activity className="h-4 w-4 text-blue-600" />}
            label="Kontakte"
            value={data.activity.contacts}
            sub="im Zeitraum"
            tone="blue"
          />
          <KpiCard
            icon={<MapPin className="h-4 w-4 text-emerald-600" />}
            label="Besuche"
            value={data.activity.visits}
            sub="vor Ort"
            tone="emerald"
          />
          <KpiCard
            icon={<Phone className="h-4 w-4 text-indigo-600" />}
            label="Telefonate"
            value={data.activity.phoneCalls}
            sub="telefonisch"
            tone="indigo"
          />
          <KpiCard
            icon={<Trophy className="h-4 w-4 text-green-600" />}
            label="Gewonnen"
            value={data.activity.wins}
            sub="Abschlüsse"
            tone="green"
          />
          <KpiCard
            icon={<XCircle className="h-4 w-4 text-red-600" />}
            label="Verloren"
            value={data.activity.losses}
            sub="Absagen"
            tone="red"
          />
          <KpiCard
            icon={<Percent className="h-4 w-4 text-purple-600" />}
            label="Conversion"
            value={
              data.activity.conversionRate != null
                ? `${data.activity.conversionRate}%`
                : "—"
            }
            sub="Gewonnen / Final"
            tone="purple"
          />
          <KpiCard
            icon={<Clock className="h-4 w-4 text-amber-600" />}
            label="Überfällig"
            value={data.followUps.overdue}
            sub="Wiedervorlagen"
            tone="amber"
          />
          <KpiCard
            icon={<Euro className="h-4 w-4 text-emerald-600" />}
            label="Gew. Umsatz"
            value={
              data.wonSalesValue != null ? formatEuro(data.wonSalesValue) : "—"
            }
            sub="im Zeitraum"
            tone="emerald"
          />
        </div>
      </div>

      {/* Main 2-Column Section: Pipeline & Follow-up Pressure */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Company Pipeline (Snapshot) */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-semibold text-gray-900">
                Vertriebspipeline
              </h2>
            </div>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-medium">
              Snapshot · {totalPipeline} Kunden
            </span>
          </div>

          {totalPipeline === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Noch keine aktiven Kunden in der Pipeline.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Stacked bar */}
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                {PIPELINE_ORDER.map((stage) => {
                  const count = data.pipeline[stage] || 0;
                  if (count === 0) return null;
                  const pct = ((count / totalPipeline) * 100).toFixed(1);
                  const info = SALES_STAGE_DISPLAY[stage];
                  return (
                    <div
                      key={stage}
                      style={{ width: `${pct}%`, backgroundColor: info.color }}
                      title={`${info.label}: ${count} (${pct}%)`}
                      className="transition-all hover:opacity-85"
                    />
                  );
                })}
              </div>

              {/* Stage List */}
              <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
                {PIPELINE_ORDER.map((stage) => {
                  const count = data.pipeline[stage] || 0;
                  const pct =
                    totalPipeline > 0
                      ? ((count / totalPipeline) * 100).toFixed(1)
                      : "0.0";
                  const info = SALES_STAGE_DISPLAY[stage];
                  return (
                    <div
                      key={stage}
                      className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: info.color }}
                        />
                        <span className="truncate text-xs font-medium text-gray-700">
                          {info.label}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-gray-900">
                          {count}
                        </span>
                        <span className="ml-1 text-[11px] text-gray-400">
                          ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Follow-up Pressure (Wiedervorlagen - Snapshot) */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <h2 className="text-base font-semibold text-gray-900">
                Wiedervorlagen
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                {data.followUps.overdue} überfällig
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                {data.followUps.dueToday} heute fällig
              </span>
            </div>
          </div>

          {data.followUps.overdueItems.length === 0 ? (
            <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
              Keine überfälligen Wiedervorlagen vorhanden.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="pb-2 font-medium">Kunde</th>
                    <th className="pb-2 font-medium">Mitarbeiter</th>
                    <th className="pb-2 font-medium">Phase</th>
                    <th className="pb-2 text-right font-medium">Überfällig</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.followUps.overdueItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-2.5 font-medium text-gray-900">
                        <Link
                          href={`/admin/markets/${item.marketId}`}
                          className="flex items-center gap-1 hover:text-blue-600"
                        >
                          <span className="truncate max-w-[150px] sm:max-w-[200px]">
                            {item.marketName}
                          </span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                        </Link>
                        {item.district && (
                          <span className="block text-[10px] text-gray-400">
                            {item.district}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-gray-600">
                        {item.assignedUserName}
                      </td>
                      <td className="py-2.5">
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor:
                              SALES_STAGE_DISPLAY[item.salesStage]?.bg,
                            color: SALES_STAGE_DISPLAY[item.salesStage]?.fg,
                          }}
                        >
                          {SALES_STAGE_DISPLAY[item.salesStage]?.label ??
                            item.salesStage}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-red-600">
                        {item.overdueDays === 1
                          ? "1 Tag"
                          : `${item.overdueDays} Tage`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Team Performance (Teamleistung) */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">
              Teamleistung
            </h2>
          </div>
          <p className="text-xs text-gray-500">
            Mitarbeiter anklicken, um gefilterte Kundenliste zu öffnen
          </p>
        </div>

        {data.employees.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Keine aktiven Mitarbeiter in diesem Unternehmen vorhanden.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-3 font-semibold">Mitarbeiter</th>
                  <th className="px-3 py-3 text-right font-semibold">Kunden</th>
                  <th className="px-3 py-3 text-right font-semibold">Kontakte</th>
                  <th className="px-3 py-3 text-right font-semibold">Besuche</th>
                  <th className="px-3 py-3 text-right font-semibold">Telefonate</th>
                  <th className="px-3 py-3 text-right font-semibold">Gewonnen</th>
                  <th className="px-3 py-3 text-right font-semibold">Verloren</th>
                  <th className="px-3 py-3 text-right font-semibold">Überfällig</th>
                  <th className="px-3 py-3 text-right font-semibold">Gew. Umsatz</th>
                  <th className="w-8 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="group cursor-pointer transition hover:bg-blue-50/50"
                    onClick={() => {
                      window.location.href = `/?assigned_user_id=${emp.id}&view=list`;
                    }}
                  >
                    <td className="px-3 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-800">
                          {emp.name
                            .split(/\s+/)
                            .map((p) => p[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 group-hover:text-blue-700">
                            {emp.name}
                            {emp.role === "admin" && (
                              <span className="ml-1.5 rounded bg-purple-50 px-1.5 py-0.2 text-[10px] font-medium text-purple-700">
                                Admin
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-400">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-gray-700">
                      {emp.assignedCustomers}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-blue-700">
                      {emp.contacts}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">
                      {emp.visits}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">
                      {emp.phoneCalls}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-green-600">
                      {emp.wins}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-red-600">
                      {emp.losses}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {emp.overdueFollowUps > 0 ? (
                        <span className="text-red-600">
                          {emp.overdueFollowUps}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-emerald-700">
                      {emp.wonSalesValue != null ? formatEuro(emp.wonSalesValue) : "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-gray-400 group-hover:text-blue-600">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Commercial Intelligence Grid: Feedback-Gründe, Lösungen, Zufriedenheit, Interesse */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Häufigste Gründe (Flow) */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Häufigste Gründe
            </h3>
            <p className="text-[11px] text-gray-500">
              Feedback im gewählten Zeitraum
            </p>
          </div>

          {data.feedbackReasons.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">
              Noch keine strukturierten Feedback-Daten vorhanden.
            </p>
          ) : (
            <div className="space-y-2">
              {data.feedbackReasons.map((item) => (
                <div key={item.reason} className="flex items-center justify-between text-xs">
                  <span className="truncate text-gray-700 max-w-[160px]">
                    {item.label}
                  </span>
                  <span className="font-bold text-gray-900">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Aktuelle Lösungen (Snapshot) */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-3">
            <div className="flex items-center gap-1.5">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">
                Aktuelle Lösungen
              </h3>
            </div>
            <p className="text-[11px] text-gray-500">
              Snapshot aller Kunden im Unternehmen
            </p>
          </div>

          <div className="space-y-2">
            {SOLUTION_ORDER.map((sol) => {
              const count = data.solutionDistribution[sol] || 0;
              const info = CURRENT_SOLUTION_DISPLAY[sol];
              return (
                <div key={sol} className="flex items-center justify-between text-xs">
                  <span className="truncate text-gray-700 max-w-[160px]">
                    {info.label}
                  </span>
                  <span className="font-bold text-gray-900">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Kundenzufriedenheit (Snapshot) */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-3">
            <div className="flex items-center gap-1.5">
              <ThumbsUp className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">
                Kundenzufriedenheit
              </h3>
            </div>
            <p className="text-[11px] text-gray-500">
              Snapshot aller Kunden im Unternehmen
            </p>
          </div>

          <div className="space-y-2">
            {SATISFACTION_ORDER.map((sat) => {
              const count = data.satisfactionDistribution[sat] || 0;
              const info = CUSTOMER_SATISFACTION_DISPLAY[sat];
              return (
                <div key={sat} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: info.color }}
                    />
                    <span className="text-gray-700">{info.label}</span>
                  </div>
                  <span className="font-bold text-gray-900">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Interesse (Snapshot) */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <div className="mb-3">
            <div className="flex items-center gap-1.5">
              <PieChart className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">
                Kunden-Interesse
              </h3>
            </div>
            <p className="text-[11px] text-gray-500">
              Zuletzt bekannter Status pro Kunde
            </p>
          </div>

          <div className="space-y-2">
            {INTEREST_ORDER.map((lvl) => {
              const count = data.interestDistribution[lvl] || 0;
              const info = INTEREST_LEVEL_DISPLAY[lvl];
              return (
                <div key={lvl} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: info.color }}
                    />
                    <span className="text-gray-700">{info.label}</span>
                  </div>
                  <span className="font-bold text-gray-900">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  tone: "blue" | "emerald" | "indigo" | "green" | "red" | "purple" | "amber";
}) {
  const toneMap: Record<string, string> = {
    blue: "border-blue-100 bg-blue-50/30",
    emerald: "border-emerald-100 bg-emerald-50/30",
    indigo: "border-indigo-100 bg-indigo-50/30",
    green: "border-green-100 bg-green-50/30",
    red: "border-red-100 bg-red-50/30",
    purple: "border-purple-100 bg-purple-50/30",
    amber: "border-amber-100 bg-amber-50/30",
  };

  return (
    <div
      className={`rounded-2xl border p-3 shadow-sm transition hover:shadow ${toneMap[tone]}`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate text-[11px] font-medium text-gray-500">
          {label}
        </span>
        {icon}
      </div>
      <p className="mt-1 text-xl font-bold tracking-tight text-gray-900">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-gray-400">{sub}</p>
    </div>
  );
}
