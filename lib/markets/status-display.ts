// Klartext-Mapping für Status & Aktionen (laut UI-Skill).
// Wird im Frontend genutzt — niemals Code-Begriffe in der UI zeigen.

import type { MarketStatus } from "@/lib/db/schema";

export interface StatusDisplay {
  label: string; // angezeigter Text
  color: string; // Hex, identisch mit Tailwind-Theme
  bg: string; // hellerer Hintergrund
  fg: string; // dunklerer Text
}

export const STATUS_DISPLAY: Record<MarketStatus, StatusDisplay> = {
  gruen: {
    label: "Frei",
    color: "#22c55e",
    bg: "#dcfce7",
    fg: "#15803d",
  },
  blau: {
    label: "Reserviert",
    color: "#3b82f6",
    bg: "#dbeafe",
    fg: "#1d4ed8",
  },
  gelb: {
    label: "Wartet auf Lieferung",
    color: "#eab308",
    bg: "#fef9c3",
    fg: "#854d0e",
  },
  orange: {
    label: "Kontrolle nötig",
    color: "#f97316",
    bg: "#ffedd5",
    fg: "#9a3412",
  },
  rosa: {
    label: "Persönliches Gespräch",
    color: "#ec4899",
    bg: "#fce7f3",
    fg: "#9d174d",
  },
  rot: {
    label: "Gesperrt",
    color: "#ef4444",
    bg: "#fee2e2",
    fg: "#991b1b",
  },
  grau: {
    label: "Inaktiv",
    color: "#6b7280",
    bg: "#f3f4f6",
    fg: "#374151",
  },
};

export function formatBerlinDate(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(date);
}

export function formatBerlinDateTime(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}
