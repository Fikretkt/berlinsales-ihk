"use client";

import Link from "next/link";
import {
  AlertCircle,
  Clock,
  Users,
  Sparkles,
  ArrowRight,
  Phone,
  MapPin,
  Mail,
  Trophy,
  FileText,
  Calendar,
} from "lucide-react";
import type { EmployeeTodayDashboardData } from "@/lib/dashboard/types";
import { SALES_STAGE_DISPLAY } from "@/lib/sales/display";
import { CURRENT_SOLUTION_DISPLAY, CUSTOMER_SATISFACTION_DISPLAY } from "@/lib/sales/intelligence";
import { formatBerlinDate } from "@/lib/markets/status-display";

export function TodayDashboardView({ data }: { data: EmployeeTodayDashboardData }) {
  const {
    greeting,
    dateFormatted,
    summary,
    overdueFollowUps,
    dueTodayFollowUps,
    pipeline,
    weeklyActivity,
    highPriorityCustomers,
  } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      {/* 1. HERO / BEGRÜSSUNG */}
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {greeting.salutation}, {greeting.userName}
          </h1>
          <p className="mt-0.5 text-sm font-medium text-slate-500">{dateFormatted}</p>
        </div>
        <Link
          href="/?assigned_to_me=true&view=list"
          className="inline-flex items-center gap-1.5 self-start rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition sm:self-auto"
        >
          <Users className="h-4 w-4" />
          Meine Kundenliste öffnen
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* 2. SUMMARY CARDS (Touch-friendly 2-Spalten-Raster auf Mobile) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Überfällig */}
        <div
          className={`rounded-2xl p-4 transition ${
            summary.overdueFollowUps > 0
              ? "border border-rose-200 bg-rose-50/60"
              : "border border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Überfällig
            </span>
            <AlertCircle
              className={`h-5 w-5 ${
                summary.overdueFollowUps > 0 ? "text-rose-600" : "text-slate-400"
              }`}
            />
          </div>
          <div
            className={`mt-2 text-2xl font-black ${
              summary.overdueFollowUps > 0 ? "text-rose-700" : "text-slate-900"
            }`}
          >
            {summary.overdueFollowUps}
          </div>
          <p className="mt-1 text-xs text-slate-500">Wiedervorlagen</p>
        </div>

        {/* Heute fällig */}
        <div
          className={`rounded-2xl p-4 transition ${
            summary.dueTodayFollowUps > 0
              ? "border border-amber-200 bg-amber-50/60"
              : "border border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Heute fällig
            </span>
            <Clock
              className={`h-5 w-5 ${
                summary.dueTodayFollowUps > 0 ? "text-amber-600" : "text-slate-400"
              }`}
            />
          </div>
          <div
            className={`mt-2 text-2xl font-black ${
              summary.dueTodayFollowUps > 0 ? "text-amber-700" : "text-slate-900"
            }`}
          >
            {summary.dueTodayFollowUps}
          </div>
          <p className="mt-1 text-xs text-slate-500">Wiedervorlagen</p>
        </div>

        {/* Meine Kunden */}
        <Link
          href="/?assigned_to_me=true&view=list"
          className="group block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 group-hover:text-blue-700">
              Meine Kunden
            </span>
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900 group-hover:text-blue-700">
            {summary.assignedCustomers}
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-blue-600 font-medium">
            Alle anzeigen <ArrowRight className="h-3 w-3" />
          </p>
        </Link>

        {/* Hohe Priorität */}
        <div
          className={`rounded-2xl p-4 transition ${
            summary.highPriorityCustomers > 0
              ? "border border-emerald-200 bg-emerald-50/60"
              : "border border-slate-200 bg-white"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Hohe Prio
            </span>
            <Sparkles
              className={`h-5 w-5 ${
                summary.highPriorityCustomers > 0 ? "text-emerald-600" : "text-slate-400"
              }`}
            />
          </div>
          <div
            className={`mt-2 text-2xl font-black ${
              summary.highPriorityCustomers > 0 ? "text-emerald-700" : "text-slate-900"
            }`}
          >
            {summary.highPriorityCustomers}
          </div>
          <p className="mt-1 text-xs text-slate-500">Hohes Interesse</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LINKE SPALTE (2 Cols auf Desktop): AKTIONSLISTEN */}
        <div className="space-y-6 lg:col-span-2">
          {/* ÜBERFÄLLIGE WIEDERVORLAGEN */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Überfällige Wiedervorlagen
                </h2>
              </div>
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                {overdueFollowUps.length}
              </span>
            </div>

            {overdueFollowUps.length === 0 ? (
              <div className="mt-4 rounded-xl bg-slate-50 py-6 text-center text-xs font-medium text-slate-500">
                Keine überfälligen Wiedervorlagen. Alles im Plan!
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {overdueFollowUps.map((item) => {
                  const stage = SALES_STAGE_DISPLAY[item.salesStage];
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/30 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-slate-900">
                            {item.marketName}
                          </span>
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: stage.bg, color: stage.fg }}
                          >
                            {stage.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                          {item.district && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {item.district}
                            </span>
                          )}
                          <span className="font-semibold text-rose-700">
                            {item.label}
                          </span>
                        </div>
                      </div>

                      <Link
                        href={`/markets/${item.marketId}`}
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition"
                      >
                        Kunde öffnen
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* HEUTE FÄLLIG */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <Clock className="h-4 w-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900">Heute fällig</h2>
              </div>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                {dueTodayFollowUps.length}
              </span>
            </div>

            {dueTodayFollowUps.length === 0 ? (
              <div className="mt-4 rounded-xl bg-slate-50 py-6 text-center text-xs font-medium text-slate-500">
                Für heute ist nichts offen.
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {dueTodayFollowUps.map((item) => {
                  const stage = SALES_STAGE_DISPLAY[item.salesStage];
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/20 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-slate-900">
                            {item.marketName}
                          </span>
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: stage.bg, color: stage.fg }}
                          >
                            {stage.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                          {item.district && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {item.district}
                            </span>
                          )}
                          <span className="font-semibold text-amber-800">
                            {item.label}
                          </span>
                        </div>
                      </div>

                      <Link
                        href={`/markets/${item.marketId}`}
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition"
                      >
                        Kunde öffnen
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* HOHE PRIORITÄT (Top 5) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  Hohe Priorität (Hohes Interesse)
                </h2>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                {summary.highPriorityCustomers}
              </span>
            </div>

            {highPriorityCustomers.length === 0 ? (
              <div className="mt-4 rounded-xl bg-slate-50 py-6 text-center text-xs font-medium text-slate-500">
                Aktuell keine Kunden mit hoher Priorität.
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {highPriorityCustomers.map((cust) => {
                  const stage = SALES_STAGE_DISPLAY[cust.salesStage];
                  const solution = CURRENT_SOLUTION_DISPLAY[cust.currentSolution];
                  const satisfaction = CUSTOMER_SATISFACTION_DISPLAY[cust.satisfaction];

                  return (
                    <div
                      key={cust.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-slate-900">
                            {cust.name}
                          </span>
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: stage.bg, color: stage.fg }}
                          >
                            {stage.label}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            Interesse: Hoch
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {cust.district && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {cust.district}
                            </span>
                          )}
                          <span>
                            Lösung:{" "}
                            <strong className="font-semibold text-slate-700">
                              {solution.label}
                            </strong>
                          </span>
                          {cust.satisfaction !== "unbekannt" && (
                            <span
                              className="inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-semibold"
                              style={{
                                backgroundColor: satisfaction.bg,
                                color: satisfaction.fg,
                              }}
                            >
                              {satisfaction.label}
                            </span>
                          )}
                          {cust.lastContactAt && (
                            <span className="text-slate-400">
                              Letzter Kontakt: {formatBerlinDate(cust.lastContactAt)}
                            </span>
                          )}
                        </div>
                      </div>

                      <Link
                        href={`/markets/${cust.id}`}
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 transition"
                      >
                        Kunde öffnen
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* RECHTE SPALTE (1 Col auf Desktop): PIPELINE & AKTIVITÄT */}
        <div className="space-y-6">
          {/* MEINE PIPELINE */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="text-base font-bold text-slate-900">Meine Pipeline</h2>
            <p className="text-xs text-slate-500">Zugeordnete Kunden nach Phase</p>

            <div className="mt-4 space-y-2">
              {(
                [
                  "neu",
                  "kontaktiert",
                  "interesse",
                  "angebot",
                  "gewonnen",
                  "verloren",
                ] as const
              ).map((stageKey) => {
                const count = pipeline[stageKey];
                const stage = SALES_STAGE_DISPLAY[stageKey];
                return (
                  <Link
                    key={stageKey}
                    href={`/?assigned_to_me=true&status=${stageKey}&view=list`}
                    className="flex items-center justify-between rounded-xl p-2 text-xs transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="font-semibold text-slate-700">{stage.label}</span>
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                      {count}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* DIESE WOCHE (PERSÖNLICHE AKTIVITÄT) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Diese Woche</h2>
                <p className="text-[11px] text-slate-500">Deine persönliche Aktivität (Mo–So)</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5 text-blue-600" />
                  <span>Kontakte</span>
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {weeklyActivity.contacts}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Besuche</span>
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {weeklyActivity.visits}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Phone className="h-3.5 w-3.5 text-amber-600" />
                  <span>Telefonate</span>
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {weeklyActivity.phoneCalls}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Trophy className="h-3.5 w-3.5 text-green-600" />
                  <span>Gewonnen</span>
                </div>
                <div className="mt-1 text-xl font-bold text-emerald-700">
                  {weeklyActivity.wins}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Mail className="h-3.5 w-3.5 text-indigo-600" />
                  <span>E-Mails</span>
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {weeklyActivity.emails}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <FileText className="h-3.5 w-3.5 text-purple-600" />
                  <span>Angebote</span>
                </div>
                <div className="mt-1 text-xl font-bold text-slate-900">
                  {weeklyActivity.offers}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
