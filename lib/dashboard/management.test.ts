import { describe, expect, it } from "vitest";
import { computeConversionRate } from "./management-types";
import {
  getBerlinMonthBoundaries,
  getBerlinPeriodBoundaries,
  getBerlinDayBoundaries,
  BERLIN_TZ,
} from "./date-utils";
import { toZonedTime } from "date-fns-tz";

describe("Sprint 008 — Management Dashboard Unit Logic", () => {
  describe("Conversion Rate calculation", () => {
    it("computes exact conversion rate for terminal outcomes", () => {
      // 12 won, 8 lost = 12 / 20 = 60%
      expect(computeConversionRate(12, 8)).toBe(60);

      // 11 won, 6 lost = 11 / 17 = 64.705... -> 64.7%
      expect(computeConversionRate(11, 6)).toBe(64.7);

      // 1 won, 0 lost = 100%
      expect(computeConversionRate(1, 0)).toBe(100);

      // 0 won, 4 lost = 0%
      expect(computeConversionRate(0, 4)).toBe(0);
    });

    it("returns null safely when no terminal outcomes exist", () => {
      expect(computeConversionRate(0, 0)).toBeNull();
    });

    it("handles negative or invalid counts safely", () => {
      expect(computeConversionRate(-1, 0)).toBeNull();
    });
  });

  describe("Berlin Month & Period Boundaries", () => {
    it("computes Berlin month boundaries strictly covering the 1st to the last calendar day", () => {
      // Fixed reference time: 2026-09-15T12:00:00Z
      const ref = new Date("2026-09-15T12:00:00Z");
      const { startOfMonth, endOfMonth } = getBerlinMonthBoundaries(ref);

      // In Berlin (UTC+2 in September CEST), 2026-09-01 00:00:00 CEST is 2026-08-31 22:00:00 UTC
      const startBerlin = toZonedTime(startOfMonth, BERLIN_TZ);
      expect(startBerlin.getDate()).toBe(1);
      expect(startBerlin.getMonth()).toBe(8); // September = 8
      expect(startBerlin.getFullYear()).toBe(2026);
      expect(startBerlin.getHours()).toBe(0);
      expect(startBerlin.getMinutes()).toBe(0);
      expect(startBerlin.getSeconds()).toBe(0);

      // Last day of September is 30
      const endBerlin = toZonedTime(endOfMonth, BERLIN_TZ);
      expect(endBerlin.getDate()).toBe(30);
      expect(endBerlin.getMonth()).toBe(8);
      expect(endBerlin.getHours()).toBe(23);
      expect(endBerlin.getMinutes()).toBe(59);
      expect(endBerlin.getSeconds()).toBe(59);
    });

    it("provides valid boundaries for all period keys", () => {
      const ref = new Date("2026-09-15T12:00:00Z");

      const today = getBerlinPeriodBoundaries("today", ref);
      expect(today.key).toBe("today");
      expect(today.label).toBe("Heute");
      expect(today.start.getTime()).toBeLessThan(today.end.getTime());

      const week = getBerlinPeriodBoundaries("week", ref);
      expect(week.key).toBe("week");
      expect(week.label).toBe("Diese Woche");
      expect(week.start.getTime()).toBeLessThan(week.end.getTime());

      const month = getBerlinPeriodBoundaries("month", ref);
      expect(month.key).toBe("month");
      expect(month.label).toBe("Dieser Monat");
      expect(month.start.getTime()).toBeLessThan(month.end.getTime());

      const thirtyDays = getBerlinPeriodBoundaries("30d", ref);
      expect(thirtyDays.key).toBe("30d");
      expect(thirtyDays.label).toBe("Letzte 30 Tage");
      expect(thirtyDays.start.getTime()).toBeLessThan(thirtyDays.end.getTime());
    });

    it("respects daylight saving transitions for Berlin calendar days", () => {
      // Test winter time (CET, UTC+1) in January
      const winterRef = new Date("2026-01-15T12:00:00Z");
      const { startOfToday, endOfToday } = getBerlinDayBoundaries(winterRef);
      const winterBerlin = toZonedTime(startOfToday, BERLIN_TZ);
      expect(winterBerlin.getDate()).toBe(15);
      expect(winterBerlin.getHours()).toBe(0);

      // Start of day in Berlin in January is 23:00 UTC of previous day
      expect(startOfToday.toISOString()).toBe("2026-01-14T23:00:00.000Z");
      expect(endOfToday.toISOString()).toBe("2026-01-15T22:59:59.999Z");
    });
  });
});
