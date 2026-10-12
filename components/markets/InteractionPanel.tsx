"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { SalesStage, InterestLevel, FeedbackReason } from "@/lib/db/schema";
import type { FollowUpType } from "@/lib/sales/types";

const CONTACT_TYPES = [
  ["visit", "Vor-Ort-Besuch"],
  ["phone", "Telefonat"],
  ["email", "E-Mail"],
  ["other", "Sonstiges"],
] as const;

const OUTCOMES = [
  ["success", "Erfolgreich"],
  ["escalation", "Interesse vorhanden"],
  ["no_contact", "Niemand angetroffen"],
  ["declined", "Abgelehnt"],
] as const;

const INTEREST_OPTIONS: [InterestLevel | "", string][] = [
  ["", "— Keine Angabe —"],
  ["hoch", "Hoch"],
  ["mittel", "Mittel"],
  ["niedrig", "Niedrig"],
  ["kein_interesse", "Kein Interesse"],
];

const REASON_OPTIONS: [FeedbackReason | "", string][] = [
  ["", "— Keine Angabe —"],
  ["preis", "Preis"],
  ["andere_loesung", "Bereits andere Lösung"],
  ["keine_zeit", "Keine Zeit"],
  ["entscheider_nicht_da", "Entscheidungsträger nicht da"],
  ["kein_bedarf", "Kein Bedarf"],
  ["spaeter_kontaktieren", "Später erneut kontaktieren"],
  ["sonstiges", "Sonstiges"],
];

const SALES_STAGE_OPTIONS: [SalesStage, string][] = [
  ["neu", "Neu"],
  ["kontaktiert", "Kontaktiert"],
  ["interesse", "Interesse"],
  ["angebot", "Angebot"],
  ["gewonnen", "Gewonnen"],
  ["verloren", "Verloren"],
];

const FOLLOW_UP_OPTIONS: [FollowUpType, string][] = [
  ["none", "Keine Wiedervorlage"],
  ["1w", "In 1 Woche"],
  ["1m", "In 1 Monat"],
  ["3m", "In 3 Monaten"],
  ["custom", "Datum auswählen"],
  ["never_contact", "Nie wieder kontaktieren"],
];

export function InteractionPanel({
  marketId,
  initialSalesStage = "neu",
  isNoContact = false,
}: {
  marketId: string;
  initialSalesStage?: SalesStage;
  isNoContact?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [contactType, setContactType] = useState<(typeof CONTACT_TYPES)[number][0]>("visit");
  const [result, setResult] = useState<(typeof OUTCOMES)[number][0]>("success");
  const [interestLevel, setInterestLevel] = useState<InterestLevel | "">("");
  const [feedbackReason, setFeedbackReason] = useState<FeedbackReason | "">("");
  const [salesStage, setSalesStage] = useState<SalesStage>(initialSalesStage);
  const [salesValue, setSalesValue] = useState<string>("");
  const [followUpType, setFollowUpType] = useState<FollowUpType>("none");
  const [customFollowUpDate, setCustomFollowUpDate] = useState<string>("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split("T")[0];

  async function submit() {
    setError(null);
    setPending(true);
    try {
      const parsedSalesValue =
        salesStage === "gewonnen" && salesValue.trim() !== ""
          ? parseFloat(salesValue.replace(",", "."))
          : undefined;

      const followUpPayload =
        followUpType !== "none"
          ? {
              type: followUpType,
              due_at: followUpType === "custom" ? customFollowUpDate || undefined : undefined,
            }
          : undefined;

      const response = await fetch("/api/v1/markets/" + marketId + "/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contact_type: contactType,
          result,
          interest_level: interestLevel || undefined,
          feedback_reason: feedbackReason || undefined,
          sales_stage: salesStage,
          sales_value: isNaN(parsedSalesValue as number) ? undefined : parsedSalesValue,
          follow_up: followUpPayload,
          note: note.trim() || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error?.message ?? "Kontakt konnte nicht gespeichert werden");
        return;
      }
      setNote("");
      setSalesValue("");
      setCustomFollowUpDate("");
      setFollowUpType("none");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["history", marketId] }),
        queryClient.invalidateQueries({ queryKey: ["notes", marketId] }),
        queryClient.invalidateQueries({ queryKey: ["market-map"] }),
      ]);
      router.refresh();
      toast.show({ message: "Kontakt erfasst.", durationMs: 3_000 });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquarePlus className="h-5 w-5 text-blue-700" />
        <h2 className="text-base font-semibold text-gray-900">Kundenkontakt erfassen</h2>
      </div>

      <div className="space-y-3">
        {/* 1. Kontaktart & Ergebnis */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Kontaktart
            <select
              value={contactType}
              onChange={(e) => setContactType(e.target.value as typeof contactType)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"
            >
              {CONTACT_TYPES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Ergebnis
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as typeof result)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"
            >
              {OUTCOMES.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 2. Structured Feedback: Interesse & Hauptgrund */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Interesse
            <select
              value={interestLevel}
              onChange={(e) => setInterestLevel(e.target.value as InterestLevel | "")}
              className="mt-1 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"
            >
              {INTEREST_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Hauptgrund
            <select
              value={feedbackReason}
              onChange={(e) => setFeedbackReason(e.target.value as FeedbackReason | "")}
              className="mt-1 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"
            >
              {REASON_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 3. Sales Pipeline / Verkaufsstatus */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            Verkaufsstatus
            <select
              value={salesStage}
              onChange={(e) => setSalesStage(e.target.value as SalesStage)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"
            >
              {SALES_STAGE_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {salesStage === "gewonnen" && (
            <label className="text-sm font-medium text-gray-700">
              Verkaufswert (EUR) <span className="font-normal text-gray-500">(optional)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={salesValue}
                onChange={(e) => setSalesValue(e.target.value)}
                placeholder="z. B. 1250.00"
                className="mt-1 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"
              />
            </label>
          )}
        </div>

        {/* 4. Wiedervorlage */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Wiedervorlage
            <select
              value={followUpType}
              disabled={isNoContact}
              onChange={(e) => setFollowUpType(e.target.value as FollowUpType)}
              className="mt-1 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base disabled:bg-gray-100 disabled:text-gray-500"
            >
              {FOLLOW_UP_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {followUpType === "custom" && (
            <label className="block text-sm font-medium text-gray-700">
              Fälligkeitsdatum
              <input
                type="date"
                min={todayStr}
                value={customFollowUpDate}
                onChange={(e) => setCustomFollowUpDate(e.target.value)}
                required
                className="mt-1 block min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"
              />
            </label>
          )}

          {followUpType === "never_contact" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 border border-amber-200">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              <p>
                <strong>Achtung:</strong> Der Kunde wird als &bdquo;Nie wieder kontaktieren&ldquo; markiert. Offene Wiedervorlagen werden beendet.
              </p>
            </div>
          )}

          {isNoContact && (
            <p className="text-xs text-amber-800">
              Dieser Kunde ist bereits als &bdquo;Nie wieder kontaktieren&ldquo; markiert.
            </p>
          )}
        </div>

        {/* 5. Notiz */}
        <label className="block text-sm font-medium text-gray-700">
          Notiz <span className="font-normal text-gray-500">(optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Kurze Gesprächsnotiz ..."
            className="mt-1 block w-full rounded-lg border border-gray-300 p-3 text-base"
          />
        </label>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      <button
        onClick={submit}
        disabled={pending}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-lg bg-blue-800 px-4 text-base font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
      >
        {pending ? "Speichert ..." : "Kontakt speichern"}
      </button>
    </section>
  );
}
