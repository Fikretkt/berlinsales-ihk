import type { CurrentSolution, CustomerSatisfaction } from "@/lib/db/schema";
import type { DisplayInfo } from "./display";

export const CURRENT_SOLUTION_DISPLAY: Record<CurrentSolution, DisplayInfo> = {
  keine: {
    label: "Keine (Bar)",
    color: "#6b7280",
    bg: "#f3f4f6",
    fg: "#374151",
  },
  sumup: {
    label: "SumUp",
    color: "#0284c7",
    bg: "#e0f2fe",
    fg: "#0369a1",
  },
  zettle: {
    label: "Zettle",
    color: "#7c3aed",
    bg: "#ede9fe",
    fg: "#6d28d9",
  },
  verifone: {
    label: "Verifone",
    color: "#d97706",
    bg: "#fef3c7",
    fg: "#b45309",
  },
  ingenico: {
    label: "Ingenico",
    color: "#059669",
    bg: "#d1fae5",
    fg: "#047857",
  },
  andere: {
    label: "Andere",
    color: "#4b5563",
    bg: "#e5e7eb",
    fg: "#1f2937",
  },
  unbekannt: {
    label: "Unbekannt",
    color: "#9ca3af",
    bg: "#f3f4f6",
    fg: "#6b7280",
  },
};

export const CUSTOMER_SATISFACTION_DISPLAY: Record<CustomerSatisfaction, DisplayInfo> = {
  zufrieden: {
    label: "Zufrieden",
    color: "#22c55e",
    bg: "#dcfce7",
    fg: "#15803d",
  },
  neutral: {
    label: "Neutral",
    color: "#eab308",
    bg: "#fef9c3",
    fg: "#854d0e",
  },
  unzufrieden: {
    label: "Unzufrieden",
    color: "#ef4444",
    bg: "#fee2e2",
    fg: "#991b1b",
  },
  unbekannt: {
    label: "Unbekannt",
    color: "#9ca3af",
    bg: "#f3f4f6",
    fg: "#6b7280",
  },
};

export const CURRENT_SOLUTIONS: CurrentSolution[] = [
  "keine",
  "sumup",
  "zettle",
  "verifone",
  "ingenico",
  "andere",
  "unbekannt",
];

export const CUSTOMER_SATISFACTIONS: CustomerSatisfaction[] = [
  "zufrieden",
  "neutral",
  "unzufrieden",
  "unbekannt",
];
