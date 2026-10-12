"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserCheck,
  UserX,
  CreditCard,
  Smile,
  Meh,
  Frown,
  HelpCircle,
  TrendingUp,
  CalendarClock,
  Clock,
  Sparkles,
  Edit2,
  Check,
  X,
} from "lucide-react";
import type { CurrentSolution, CustomerSatisfaction, SalesStage, InterestLevel } from "@/lib/db/schema";
import {
  CURRENT_SOLUTION_DISPLAY,
  CUSTOMER_SATISFACTION_DISPLAY,
  CURRENT_SOLUTIONS,
  CUSTOMER_SATISFACTIONS,
} from "@/lib/sales/intelligence";
import { SALES_STAGE_DISPLAY, INTEREST_LEVEL_DISPLAY, formatEuro } from "@/lib/sales/display";
import { formatBerlinDate } from "@/lib/markets/status-display";
import { isOverdue } from "@/lib/sales/follow-up-utils";

interface CustomerIntelligenceCardProps {
  marketId: string;
  currentUserId: string;
  isAdmin?: boolean;
  assignedUser: { id: string; name: string; email: string } | null;
  currentSolution: CurrentSolution;
  satisfaction: CustomerSatisfaction;
  salesStage: SalesStage;
  salesValue: number | null;
  noContact: boolean;
  nextFollowUp: {
    id: string;
    dueAt: Date | string;
    userName: string;
  } | null;
  lastAction: {
    createdAt: Date | string;
    contactType: string | null;
    interestLevel: string | null;
  } | null;
}

export function CustomerIntelligenceCard({
  marketId,
  currentUserId,
  isAdmin = false,
  assignedUser: initialAssignedUser,
  currentSolution: initialSolution,
  satisfaction: initialSatisfaction,
  salesStage,
  salesValue,
  noContact,
  nextFollowUp,
  lastAction,
}: CustomerIntelligenceCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [solution, setSolution] = useState<CurrentSolution>(initialSolution);
  const [sat, setSat] = useState<CustomerSatisfaction>(initialSatisfaction);
  const [error, setError] = useState<string | null>(null);

  // Admin Quick-Edit für Zuweisung (Sprint 007)
  const [assignedUser, setAssignedUser] = useState(initialAssignedUser);
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [activeUsers, setActiveUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(initialAssignedUser?.id ?? "");
  const [savingAssignment, setSavingAssignment] = useState(false);

  async function openAssignmentEdit() {
    setError(null);
    setSelectedUserId(assignedUser?.id ?? "");
    setEditingAssignment(true);
    if (activeUsers.length === 0) {
      setLoadingUsers(true);
      try {
        const res = await fetch("/api/v1/admin/users", { credentials: "include" });
        const json = await res.json();
        const users = (json.data?.items ?? []).filter((u: { active: boolean }) => u.active);
        setActiveUsers(users);
      } catch {
        setError("Mitarbeiterliste konnte nicht geladen werden.");
      } finally {
        setLoadingUsers(false);
      }
    }
  }

  async function saveAssignment() {
    setSavingAssignment(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/markets/${marketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_user_id: selectedUserId || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Zuweisung fehlgeschlagen");
        return;
      }
      const matched = activeUsers.find((u) => u.id === selectedUserId);
      setAssignedUser(matched ? { id: matched.id, name: matched.name, email: matched.email } : null);
      setEditingAssignment(false);
      router.refresh();
    } catch {
      setError("Verbindung fehlgeschlagen beim Speichern der Zuweisung.");
    } finally {
      setSavingAssignment(false);
    }
  }

  const isAssignedToMe = assignedUser?.id === currentUserId;
  const stageInfo = SALES_STAGE_DISPLAY[salesStage] ?? SALES_STAGE_DISPLAY.neu;
  const currentSolInfo = CURRENT_SOLUTION_DISPLAY[solution] ?? CURRENT_SOLUTION_DISPLAY.unbekannt;
  const currentSatInfo = CUSTOMER_SATISFACTION_DISPLAY[sat] ?? CUSTOMER_SATISFACTION_DISPLAY.unbekannt;

  const hasOverdueFollowUp = nextFollowUp
    ? isOverdue(typeof nextFollowUp.dueAt === "string" ? new Date(nextFollowUp.dueAt) : nextFollowUp.dueAt)
    : false;

  const lastContactDate = lastAction?.createdAt
    ? formatBerlinDate(typeof lastAction.createdAt === "string" ? new Date(lastAction.createdAt) : lastAction.createdAt)
    : null;

  const contactTypeLabel: Record<string, string> = {
    visit: "Vor-Ort-Besuch",
    phone: "Telefonat",
    email: "E-Mail",
    other: "Sonstiges",
  };

  const interestInfo = lastAction?.interestLevel
    ? INTEREST_LEVEL_DISPLAY[lastAction.interestLevel as InterestLevel]
    : null;

  async function handleSaveIntelligence() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/markets/${marketId}/intelligence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_solution: solution,
          satisfaction: sat,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message ?? "Aktualisierung fehlgeschlagen");
      }
      setEditing(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setSolution(initialSolution);
    setSat(initialSatisfaction);
    setError(null);
    setEditing(false);
  }

  function renderSatisfactionIcon(val: CustomerSatisfaction, className = "h-4 w-4") {
    switch (val) {
      case "zufrieden":
        return <Smile className={`${className} text-emerald-600`} />;
      case "neutral":
        return <Meh className={`${className} text-amber-500`} />;
      case "unzufrieden":
        return <Frown className={`${className} text-red-500`} />;
      default:
        return <HelpCircle className={`${className} text-gray-400`} />;
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-900">Vertriebs- & Kundenprofil</h2>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200"
          >
            <Edit2 className="h-3 w-3" />
            Lösung bearbeiten
          </button>
        )}
      </div>

      {error && (
        <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Grid of Key Commercial Scanning Fields */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        {/* 1. Zugewiesen an */}
        <div className="rounded-xl bg-slate-50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Zugewiesen an
            </span>
            {isAdmin && !editingAssignment && (
              <button
                type="button"
                onClick={openAssignmentEdit}
                className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                Bearbeiten
              </button>
            )}
          </div>
          {editingAssignment ? (
            <div className="mt-1.5 space-y-1.5">
              {loadingUsers ? (
                <div className="text-[11px] text-slate-500">Benutzer laden...</div>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={savingAssignment}
                  className="w-full rounded-lg border border-slate-300 bg-white p-1 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Nicht zugewiesen</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={saveAssignment}
                  disabled={savingAssignment || loadingUsers}
                  className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingAssignment ? "..." : "Speichern"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAssignment(false)}
                  disabled={savingAssignment}
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900">
                {assignedUser ? (
                  <>
                    <UserCheck className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="truncate">{assignedUser.name}</span>
                  </>
                ) : (
                  <>
                    <UserX className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="font-normal text-slate-500">Nicht zugewiesen</span>
                  </>
                )}
              </div>
              {isAssignedToMe && (
                <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                  Dir zugewiesen
                </span>
              )}
            </>
          )}
        </div>

        {/* 2. Verkaufsstatus */}
        <div className="rounded-xl bg-slate-50 p-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Verkaufsstatus
          </span>
          <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900">
            <TrendingUp className="h-4 w-4 shrink-0 text-blue-600" />
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: stageInfo.bg, color: stageInfo.fg }}
            >
              {stageInfo.label}
            </span>
          </div>
          {salesStage === "gewonnen" && salesValue != null && (
            <span className="mt-0.5 block font-bold text-emerald-700">
              {formatEuro(salesValue)}
            </span>
          )}
        </div>

        {/* 3. Aktuelle Lösung */}
        <div className="rounded-xl bg-slate-50 p-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Aktuelle Lösung
          </span>
          <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900">
            <CreditCard className="h-4 w-4 shrink-0 text-slate-600" />
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: currentSolInfo.bg, color: currentSolInfo.fg }}
            >
              {currentSolInfo.label}
            </span>
          </div>
        </div>

        {/* 4. Zufriedenheit */}
        <div className="rounded-xl bg-slate-50 p-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Zufriedenheit
          </span>
          <div className="mt-1 flex items-center gap-1.5 font-semibold text-slate-900">
            {renderSatisfactionIcon(sat)}
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: currentSatInfo.bg, color: currentSatInfo.fg }}
            >
              {currentSatInfo.label}
            </span>
          </div>
        </div>

        {/* 5. Interesse (aus letztem Kontakt) */}
        <div className="rounded-xl bg-slate-50 p-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Interesse
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-slate-800">
            {interestInfo ? (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: interestInfo.bg, color: interestInfo.fg }}
              >
                {interestInfo.label}
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
        </div>

        {/* 6. Nächste Wiedervorlage */}
        <div className="rounded-xl bg-slate-50 p-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Wiedervorlage
          </span>
          <div className="mt-1 text-slate-900">
            {noContact ? (
              <span className="font-semibold text-red-600">Nie wieder</span>
            ) : nextFollowUp ? (
              <div className="flex items-center gap-1 font-medium">
                <CalendarClock
                  className={`h-3.5 w-3.5 shrink-0 ${
                    hasOverdueFollowUp ? "text-red-600" : "text-blue-600"
                  }`}
                />
                <span className="truncate">
                  {formatBerlinDate(
                    typeof nextFollowUp.dueAt === "string"
                      ? new Date(nextFollowUp.dueAt)
                      : nextFollowUp.dueAt,
                  )}
                </span>
                {hasOverdueFollowUp && (
                  <span className="rounded bg-red-100 px-1 text-[9px] font-bold uppercase text-red-700">
                    Überfällig
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-400">Keine</span>
            )}
          </div>
        </div>

        {/* 7. Letzter Kontakt */}
        <div className="col-span-2 rounded-xl bg-slate-50 p-2.5 sm:col-span-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Letzter Kontakt
          </span>
          <div className="mt-1 flex items-center gap-2 text-slate-900">
            {lastContactDate ? (
              <>
                <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="font-medium">{lastContactDate}</span>
                {lastAction?.contactType && (
                  <span className="text-slate-500">
                    · {contactTypeLabel[lastAction.contactType] ?? lastAction.contactType}
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">Noch kein Kontakt erfasst</span>
            )}
          </div>
        </div>
      </div>

      {/* Quick-Editor Drawer/Card for Field Reps */}
      {editing && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
              Lösung & Zufriedenheit anpassen
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Aktuelle Lösung des Kunden
              </label>
              <select
                value={solution}
                onChange={(e) => setSolution(e.target.value as CurrentSolution)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CURRENT_SOLUTIONS.map((sol) => (
                  <option key={sol} value={sol}>
                    {CURRENT_SOLUTION_DISPLAY[sol].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Zufriedenheit mit bisheriger Lösung
              </label>
              <select
                value={sat}
                onChange={(e) => setSat(e.target.value as CustomerSatisfaction)}
                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CUSTOMER_SATISFACTIONS.map((item) => (
                  <option key={item} value={item}>
                    {CUSTOMER_SATISFACTION_DISPLAY[item].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <X className="h-3 w-3" />
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSaveIntelligence}
              disabled={saving}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              {saving ? "Speichern ..." : "Übernehmen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
