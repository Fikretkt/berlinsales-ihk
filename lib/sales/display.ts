import type {
  SalesStage,
  InterestLevel,
  FeedbackReason,
} from "@/lib/db/schema";
import type { FollowUpType } from "./types";

export interface DisplayInfo {
  label: string;
  color?: string;
  bg?: string;
  fg?: string;
}

export const SALES_STAGE_DISPLAY: Record<SalesStage, DisplayInfo> = {
  neu: {
    label: "Neu",
    color: "#6b7280",
    bg: "#f3f4f6",
    fg: "#374151",
  },
  kontaktiert: {
    label: "Kontaktiert",
    color: "#3b82f6",
    bg: "#dbeafe",
    fg: "#1d4ed8",
  },
  interesse: {
    label: "Interesse",
    color: "#eab308",
    bg: "#fef9c3",
    fg: "#854d0e",
  },
  angebot: {
    label: "Angebot",
    color: "#8b5cf6",
    bg: "#ede9fe",
    fg: "#6d28d9",
  },
  gewonnen: {
    label: "Gewonnen",
    color: "#22c55e",
    bg: "#dcfce7",
    fg: "#15803d",
  },
  verloren: {
    label: "Verloren",
    color: "#ef4444",
    bg: "#fee2e2",
    fg: "#991b1b",
  },
};

export const INTEREST_LEVEL_DISPLAY: Record<InterestLevel, DisplayInfo> = {
  hoch: {
    label: "Hoch",
    color: "#22c55e",
    bg: "#dcfce7",
    fg: "#15803d",
  },
  mittel: {
    label: "Mittel",
    color: "#eab308",
    bg: "#fef9c3",
    fg: "#854d0e",
  },
  niedrig: {
    label: "Niedrig",
    color: "#f97316",
    bg: "#ffedd5",
    fg: "#9a3412",
  },
  kein_interesse: {
    label: "Kein Interesse",
    color: "#6b7280",
    bg: "#f3f4f6",
    fg: "#374151",
  },
};

export const FEEDBACK_REASON_DISPLAY: Record<FeedbackReason, DisplayInfo> = {
  preis: { label: "Preis" },
  andere_loesung: { label: "Bereits andere Lösung" },
  keine_zeit: { label: "Keine Zeit" },
  entscheider_nicht_da: { label: "Entscheidungsträger nicht da" },
  kein_bedarf: { label: "Kein Bedarf" },
  spaeter_kontaktieren: { label: "Später erneut kontaktieren" },
  sonstiges: { label: "Sonstiges" },
};

export const FOLLOW_UP_DISPLAY: Record<FollowUpType, string> = {
  none: "Keine Wiedervorlage",
  "1w": "In 1 Woche",
  "1m": "In 1 Monat",
  "3m": "In 3 Monaten",
  custom: "Datum auswählen",
  never_contact: "Nie wieder kontaktieren",
};

export function formatEuro(amount: number | string | null | undefined): string {
  if (amount == null) return "0,00 €";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "0,00 €";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}
