import type { FollowUpType } from "./types";

export type FollowUpCategory =
  | "overdue"
  | "today"
  | "this_week"
  | "this_month"
  | "later";

export const CATEGORY_LABELS: Record<FollowUpCategory, string> = {
  overdue: "Überfällig",
  today: "Heute fällig",
  this_week: "Diese Woche",
  this_month: "Diesen Monat",
  later: "Später",
};

/**
 * Berechnet das Fälligkeitsdatum für eine gewählte Wiedervorlage-Option.
 */
export function calculateFollowUpDueAt(
  type: FollowUpType,
  customDate?: string | Date | null,
  baseDate = new Date(),
): Date | null {
  if (type === "none" || type === "never_contact") {
    return null;
  }

  if (type === "1w") {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 7);
    return d;
  }

  if (type === "1m") {
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() + 1);
    return d;
  }

  if (type === "3m") {
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() + 3);
    return d;
  }

  if (type === "custom") {
    if (!customDate) return null;
    if (customDate instanceof Date) {
      if (isNaN(customDate.getTime())) return null;
      return customDate;
    }
    // Parse "YYYY-MM-DD" oder ISO-String
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate.trim());
    if (dateOnlyMatch) {
      const year = parseInt(dateOnlyMatch[1]!, 10);
      const month = parseInt(dateOnlyMatch[2]!, 10) - 1;
      const day = parseInt(dateOnlyMatch[3]!, 10);
      const parsed = new Date(Date.UTC(year, month, day, 9, 0, 0));
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(customDate);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Prüft, ob ein Fälligkeitsdatum überfällig ist (vor dem heutigen Tag in Berlin/Lokalzeit).
 */
export function isOverdue(dueAt: Date | string | null, now = new Date()): boolean {
  if (!dueAt) return false;
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return d.getTime() < todayStart.getTime();
}

/**
 * Ordnet ein Fälligkeitsdatum einer Kategorie zu (Dashboard-Grundlage).
 */
export function categorizeFollowUp(
  dueAt: Date | string,
  now = new Date(),
): FollowUpCategory {
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (d.getTime() < startToday.getTime()) {
    return "overdue";
  }

  if (d.getTime() <= endToday.getTime()) {
    return "today";
  }

  // Diese Woche (bis Sonntag 23:59)
  const dayOfWeek = (now.getDay() + 6) % 7; // Montag = 0, Sonntag = 6
  const endOfWeek = new Date(startToday);
  endOfWeek.setDate(endOfWeek.getDate() + (6 - dayOfWeek));
  endOfWeek.setHours(23, 59, 59, 999);

  if (d.getTime() <= endOfWeek.getTime()) {
    return "this_week";
  }

  // Diesen Monat (bis Monatsende 23:59)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  if (d.getTime() <= endOfMonth.getTime()) {
    return "this_month";
  }

  return "later";
}
