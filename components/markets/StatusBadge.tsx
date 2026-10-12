// Status-Badge: Farbe + Icon + Klartext (niemals nur Farbe — UI-Skill).
// Wird in Liste, Karte (Bottom-Sheet) und Detail-Seite verwendet.

import { CircleDot } from "lucide-react";
import type { MarketStatus } from "@/lib/db/schema";
import { STATUS_DISPLAY } from "@/lib/markets/status-display";

export function StatusBadge({
  status,
  size = "md",
}: {
  status: MarketStatus;
  size?: "sm" | "md" | "lg";
}) {
  const display = STATUS_DISPLAY[status];
  const sizes = {
    sm: { padding: "px-2 py-0.5", text: "text-xs", icon: 12 },
    md: { padding: "px-2.5 py-1", text: "text-sm", icon: 14 },
    lg: { padding: "px-3 py-1.5", text: "text-base", icon: 16 },
  } as const;
  const s = sizes[size];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${s.padding} ${s.text}`}
      style={{ backgroundColor: display.bg, color: display.fg }}
      aria-label={`Status: ${display.label}`}
    >
      <CircleDot size={s.icon} aria-hidden style={{ color: display.color }} />
      {display.label}
    </span>
  );
}
