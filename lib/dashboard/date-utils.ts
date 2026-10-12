import { toZonedTime, fromZonedTime } from "date-fns-tz";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
} from "date-fns";
import type { ManagementPeriodKey } from "./management-types";

export const BERLIN_TZ = "Europe/Berlin";

/**
 * Liefert die UTC-Start- und Endzeitpunkte für den heutigen Kalendertag in Berlin.
 */
export function getBerlinDayBoundaries(now = new Date()): {
  startOfToday: Date;
  endOfToday: Date;
} {
  const berlinNow = toZonedTime(now, BERLIN_TZ);
  const startBerlin = startOfDay(berlinNow);
  const endBerlin = endOfDay(berlinNow);
  return {
    startOfToday: fromZonedTime(startBerlin, BERLIN_TZ),
    endOfToday: fromZonedTime(endBerlin, BERLIN_TZ),
  };
}

/**
 * Liefert die UTC-Start- und Endzeitpunkte für die aktuelle Kalenderwoche (Montag bis Sonntag) in Berlin.
 */
export function getBerlinWeekBoundaries(now = new Date()): {
  startOfWeek: Date;
  endOfWeek: Date;
} {
  const berlinNow = toZonedTime(now, BERLIN_TZ);
  const startBerlin = startOfWeek(berlinNow, { weekStartsOn: 1 }); // Montag = 1
  const endBerlin = endOfWeek(berlinNow, { weekStartsOn: 1 }); // Sonntag = 7
  return {
    startOfWeek: fromZonedTime(startBerlin, BERLIN_TZ),
    endOfWeek: fromZonedTime(endBerlin, BERLIN_TZ),
  };
}

/**
 * Liefert die UTC-Start- und Endzeitpunkte für den aktuellen Kalendermonat in Berlin.
 * (1. Tag 00:00:00 bis letzter Tag 23:59:59.999)
 */
export function getBerlinMonthBoundaries(now = new Date()): {
  startOfMonth: Date;
  endOfMonth: Date;
} {
  const berlinNow = toZonedTime(now, BERLIN_TZ);
  const startBerlin = startOfMonth(berlinNow);
  const endBerlin = endOfMonth(berlinNow);
  return {
    startOfMonth: fromZonedTime(startBerlin, BERLIN_TZ),
    endOfMonth: fromZonedTime(endBerlin, BERLIN_TZ),
  };
}

/**
 * Liefert die UTC-Start- und Endzeitpunkte für die letzten 30 Kalendertage bis einschließlich heute in Berlin.
 */
export function getBerlin30DaysBoundaries(now = new Date()): {
  startOfPeriod: Date;
  endOfPeriod: Date;
} {
  const berlinNow = toZonedTime(now, BERLIN_TZ);
  const startBerlin = startOfDay(subDays(berlinNow, 29)); // 30 Tage inkl. heute
  const endBerlin = endOfDay(berlinNow);
  return {
    startOfPeriod: fromZonedTime(startBerlin, BERLIN_TZ),
    endOfPeriod: fromZonedTime(endBerlin, BERLIN_TZ),
  };
}

export const PERIOD_LABELS: Record<ManagementPeriodKey, string> = {
  today: "Heute",
  week: "Diese Woche",
  month: "Dieser Monat",
  "30d": "Letzte 30 Tage",
};

/**
 * Liefert die validierten UTC-Start- und Endzeitpunkte für einen gewählten Management-Zeitraum.
 */
export function getBerlinPeriodBoundaries(
  periodKey: ManagementPeriodKey,
  now = new Date(),
): {
  key: ManagementPeriodKey;
  label: string;
  start: Date;
  end: Date;
} {
  const label = PERIOD_LABELS[periodKey] ?? "Diese Woche";
  switch (periodKey) {
    case "today": {
      const { startOfToday, endOfToday } = getBerlinDayBoundaries(now);
      return { key: "today", label, start: startOfToday, end: endOfToday };
    }
    case "month": {
      const { startOfMonth, endOfMonth } = getBerlinMonthBoundaries(now);
      return { key: "month", label, start: startOfMonth, end: endOfMonth };
    }
    case "30d": {
      const { startOfPeriod, endOfPeriod } = getBerlin30DaysBoundaries(now);
      return { key: "30d", label, start: startOfPeriod, end: endOfPeriod };
    }
    case "week":
    default: {
      const { startOfWeek, endOfWeek } = getBerlinWeekBoundaries(now);
      return { key: "week", label, start: startOfWeek, end: endOfWeek };
    }
  }
}

/**
 * Formatiert das heutige Datum auf Deutsch (z.B. "Heute · 6. September").
 */
export function formatGermanTodayDate(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TZ,
    day: "numeric",
    month: "long",
  });
  return `Heute · ${formatter.format(now)}`;
}

/**
 * Liefert die passende Begrüßung basierend auf der Uhrzeit in Berlin.
 */
export function getGreetingSalutation(now = new Date()): string {
  const hourFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TZ,
    hour: "numeric",
    hourCycle: "h23",
  });
  const hour = parseInt(hourFormatter.format(now), 10);
  if (hour < 12) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

/**
 * Berechnet, wie viele Kalendertage ein Fälligkeitsdatum in Berlin überfällig ist.
 * Gibt 0 zurück, wenn es heute fällig oder zukünftig ist.
 */
export function calculateOverdueDays(
  dueAt: Date | string,
  now = new Date(),
): number {
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const { startOfToday } = getBerlinDayBoundaries(now);
  if (d.getTime() >= startOfToday.getTime()) {
    return 0;
  }
  const diffMs = startOfToday.getTime() - d.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

/**
 * Formatiert die Überfälligkeits- oder Fälligkeitsbezeichnung auf Deutsch.
 */
export function formatFollowUpLabel(
  dueAt: Date | string,
  now = new Date(),
): { isOverdue: boolean; isToday: boolean; label: string } {
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const { startOfToday, endOfToday } = getBerlinDayBoundaries(now);

  if (d.getTime() < startOfToday.getTime()) {
    const days = calculateOverdueDays(d, now);
    return {
      isOverdue: true,
      isToday: false,
      label: days === 1 ? "Überfällig seit 1 Tag" : `Überfällig seit ${days} Tagen`,
    };
  }

  if (d.getTime() <= endOfToday.getTime()) {
    return {
      isOverdue: false,
      isToday: true,
      label: "Heute fällig",
    };
  }

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  return {
    isOverdue: false,
    isToday: false,
    label: `Fällig am ${dateFormatter.format(d)}`,
  };
}
