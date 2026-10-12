"use client";

// Markt-Aktions-Historie: letzte 20 Aktionen mit Klartext + User + Zeit.

import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Truck,
  ClipboardCheck,
  Ban,
  Star,
  ShieldAlert,
  History,
  CloudOff,
  Calendar,
} from "lucide-react";
import { STATUS_DISPLAY, formatBerlinDateTime, formatBerlinDate } from "@/lib/markets/status-display";
import {
  SALES_STAGE_DISPLAY,
  INTEREST_LEVEL_DISPLAY,
  FEEDBACK_REASON_DISPLAY,
  formatEuro,
} from "@/lib/sales/display";
import type { MarketStatus, SalesStage, InterestLevel, FeedbackReason } from "@/lib/db/schema";

interface HistoryItem {
  id: string;
  type: string;
  contactType: string | null;
  result: string | null;
  resultingStatus: MarketStatus;
  cooldownUntil: string | null;
  interestLevel: InterestLevel | null;
  feedbackReason: FeedbackReason | null;
  salesStage: SalesStage | null;
  salesValue: number | null;
  followUpDueAt: string | null;
  userId: string;
  userName: string;
  createdAt: string;
  payload: Record<string, unknown>;
  offlineRecorded: boolean;
  note: string | null;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  visit: <MapPin className="h-4 w-4" />,
  profi_visit: <Star className="h-4 w-4" />,
  delivery: <Truck className="h-4 w-4" />,
  control: <ClipboardCheck className="h-4 w-4" />,
  cancel_order: <Ban className="h-4 w-4" />,
  manual_override: <ShieldAlert className="h-4 w-4" />,
};

const TYPE_LABEL: Record<string, string> = {
  visit: "Besuch",
  profi_visit: "Persönliches Gespräch",
  delivery: "Lieferung",
  control: "Kontrolle",
  cancel_order: "Bestellung storniert",
  manual_override: "Status manuell überschrieben",
};

const CONTACT_TYPE_LABEL: Record<string, string> = {
  visit: "Besuch",
  phone: "Telefon",
  email: "E-Mail",
  other: "Sonstiges",
};

const RESULT_LABEL: Record<string, string> = {
  success: "erfolgreich",
  escalation: "Interesse vorhanden",
  declined: "abgelehnt",
  no_contact: "niemand angetroffen",
  ok: "okay",
  problem: "Problem",
};

async function fetchHistory(marketId: string): Promise<HistoryItem[]> {
  const res = await fetch(`/api/v1/markets/${marketId}/actions/history`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Fehler");
  return (await res.json()).data.items;
}

function describePayload(type: string, payload: Record<string, unknown>): string | null {
  if (type === "manual_override") {
    const reason = payload?.reason;
    const target = payload?.target_status;
    if (typeof reason === "string" && typeof target === "string") {
      const targetLabel = STATUS_DISPLAY[target as MarketStatus]?.label ?? target;
      return `→ ${targetLabel}: ${reason}`;
    }
  }
  if (type === "cancel_order" && typeof payload?.reason === "string") {
    return `Grund: ${payload.reason}`;
  }
  if (type === "control" && typeof payload?.problem_description === "string") {
    return `Problem: ${payload.problem_description}`;
  }
  return null;
}

export function HistoryPanel({ marketId }: { marketId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["history", marketId],
    queryFn: () => fetchHistory(marketId),
    staleTime: 10_000,
  });

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-gray-500" />
        <h2 className="text-base font-semibold">Aktivität</h2>
      </div>
      {isLoading && <p className="text-sm text-gray-500">Lädt …</p>}
      {data?.length === 0 && (
        <p className="text-sm italic text-gray-500">Noch keine Aktionen.</p>
      )}
      <ul className="space-y-3">
        {data?.map((a) => {
          const detail = describePayload(a.type, a.payload);
          const newStatus = STATUS_DISPLAY[a.resultingStatus];
          const interestInfo = a.interestLevel ? INTEREST_LEVEL_DISPLAY[a.interestLevel] : null;
          const reasonInfo = a.feedbackReason ? FEEDBACK_REASON_DISPLAY[a.feedbackReason] : null;
          const stageInfo = a.salesStage ? SALES_STAGE_DISPLAY[a.salesStage] : null;

          return (
            <li key={a.id} className="flex gap-3 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
              <div
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: newStatus?.bg, color: newStatus?.fg }}
                aria-hidden
              >
                {TYPE_ICON[a.type]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <strong className="text-gray-900">
                    {a.contactType
                      ? CONTACT_TYPE_LABEL[a.contactType] ?? a.contactType
                      : TYPE_LABEL[a.type] ?? a.type}
                  </strong>
                  {a.result && (
                    <span className="text-gray-600">
                      {" "}— {RESULT_LABEL[a.result] ?? a.result}
                    </span>
                  )}
                  {a.offlineRecorded && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                      <CloudOff className="h-3 w-3" /> offline
                    </span>
                  )}
                </p>

                {/* Structured Sales Badges */}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {stageInfo && (
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 font-medium"
                      style={{ backgroundColor: stageInfo.bg, color: stageInfo.fg }}
                    >
                      Status: {stageInfo.label}
                      {a.salesStage === "gewonnen" && a.salesValue != null && ` (${formatEuro(a.salesValue)})`}
                    </span>
                  )}
                  {interestInfo && (
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 font-medium"
                      style={{ backgroundColor: interestInfo.bg, color: interestInfo.fg }}
                    >
                      Interesse: {interestInfo.label}
                    </span>
                  )}
                  {reasonInfo && (
                    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                      Grund: {reasonInfo.label}
                    </span>
                  )}
                  {a.followUpDueAt && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-800">
                      <Calendar className="h-3 w-3" />
                      Wiedervorlage: {formatBerlinDate(a.followUpDueAt)}
                    </span>
                  )}
                </div>

                {detail && (
                  <p className="mt-1 text-xs italic text-gray-600">{detail}</p>
                )}
                {a.note && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{a.note}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {a.userName} · {formatBerlinDateTime(a.createdAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
