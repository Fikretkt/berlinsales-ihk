import { describe, expect, it } from "vitest";
import {
  getBerlinDayBoundaries,
  getBerlinWeekBoundaries,
  formatGermanTodayDate,
  getGreetingSalutation,
  calculateOverdueDays,
  formatFollowUpLabel,
} from "./date-utils";

describe("Dashboard Date Utils (Berlin Timezone)", () => {
  describe("getBerlinDayBoundaries", () => {
    it("returns correct start and end of day in Europe/Berlin", () => {
      // 2026-09-06 is CEST (UTC+2)
      const fixedDate = new Date("2026-09-06T12:00:00Z");
      const { startOfToday, endOfToday } = getBerlinDayBoundaries(fixedDate);

      // In CEST (UTC+2), 00:00:00.000 is 2026-09-05T22:00:00.000Z
      expect(startOfToday.toISOString()).toBe("2026-09-05T22:00:00.000Z");
      // And 23:59:59.999 is 2026-09-06T21:59:59.999Z
      expect(endOfToday.toISOString()).toBe("2026-09-06T21:59:59.999Z");
    });

    it("handles winter time (CET, UTC+1)", () => {
      // 2026-01-15 is CET (UTC+1)
      const fixedDate = new Date("2026-01-15T10:00:00Z");
      const { startOfToday, endOfToday } = getBerlinDayBoundaries(fixedDate);

      // In CET (UTC+1), 00:00:00.000 is 2026-01-14T23:00:00.000Z
      expect(startOfToday.toISOString()).toBe("2026-01-14T23:00:00.000Z");
      expect(endOfToday.toISOString()).toBe("2026-01-15T22:59:59.999Z");
    });
  });

  describe("getBerlinWeekBoundaries", () => {
    it("calculates Monday 00:00 to Sunday 23:59 for a Sunday", () => {
      // 2026-09-06 is Sunday
      // Week should start on Monday 2026-08-31 00:00 Berlin time
      // and end on Sunday 2026-09-06 23:59:59.999 Berlin time
      const sunday = new Date("2026-09-06T14:00:00Z");
      const { startOfWeek, endOfWeek } = getBerlinWeekBoundaries(sunday);

      // 2026-08-31 00:00 CEST -> 2026-08-30T22:00:00.000Z
      expect(startOfWeek.toISOString()).toBe("2026-08-30T22:00:00.000Z");
      // 2026-09-06 23:59:59.999 CEST -> 2026-09-06T21:59:59.999Z
      expect(endOfWeek.toISOString()).toBe("2026-09-06T21:59:59.999Z");
    });

    it("calculates Monday 00:00 to Sunday 23:59 for a Wednesday", () => {
      // 2026-09-02 is Wednesday
      const wednesday = new Date("2026-09-02T10:00:00Z");
      const { startOfWeek, endOfWeek } = getBerlinWeekBoundaries(wednesday);

      expect(startOfWeek.toISOString()).toBe("2026-08-30T22:00:00.000Z");
      expect(endOfWeek.toISOString()).toBe("2026-09-06T21:59:59.999Z");
    });
  });

  describe("formatGermanTodayDate", () => {
    it("formats date in German locale style (e.g., 'Heute · 6. September')", () => {
      const fixedDate = new Date("2026-09-06T12:00:00Z");
      const formatted = formatGermanTodayDate(fixedDate);
      expect(formatted).toBe("Heute · 6. September");
    });
  });

  describe("getGreetingSalutation", () => {
    it("returns Guten Morgen in morning hours (Berlin time)", () => {
      // 06:30 UTC = 08:30 CEST
      const morning = new Date("2026-09-06T06:30:00Z");
      expect(getGreetingSalutation(morning)).toBe("Guten Morgen");
    });

    it("returns Guten Tag in midday/afternoon hours (Berlin time)", () => {
      // 12:30 UTC = 14:30 CEST
      const afternoon = new Date("2026-09-06T12:30:00Z");
      expect(getGreetingSalutation(afternoon)).toBe("Guten Tag");
    });

    it("returns Guten Abend in evening hours (Berlin time)", () => {
      // 17:00 UTC = 19:00 CEST
      const evening = new Date("2026-09-06T17:00:00Z");
      expect(getGreetingSalutation(evening)).toBe("Guten Abend");
    });
  });

  describe("calculateOverdueDays and formatFollowUpLabel", () => {
    const fixedNow = new Date("2026-09-06T12:00:00Z"); // Sunday, 6. September

    it("identifies past due dates as overdue and formats label accordingly", () => {
      // 3 days overdue (2026-09-03)
      const pastDate = new Date("2026-09-03T10:00:00Z");
      const overdueDays = calculateOverdueDays(pastDate, fixedNow);
      expect(overdueDays).toBe(3);

      const labelInfo = formatFollowUpLabel(pastDate, fixedNow);
      expect(labelInfo.isOverdue).toBe(true);
      expect(labelInfo.isToday).toBe(false);
      expect(labelInfo.label).toBe("Überfällig seit 3 Tagen");
    });

    it("handles 1 day overdue with singular text", () => {
      // 1 day overdue (2026-09-05)
      const pastDate = new Date("2026-09-05T10:00:00Z");
      const overdueDays = calculateOverdueDays(pastDate, fixedNow);
      expect(overdueDays).toBe(1);

      const labelInfo = formatFollowUpLabel(pastDate, fixedNow);
      expect(labelInfo.isOverdue).toBe(true);
      expect(labelInfo.isToday).toBe(false);
      expect(labelInfo.label).toBe("Überfällig seit 1 Tag");
    });

    it("identifies items due today", () => {
      // Same day (2026-09-06T09:00:00Z)
      const todayDate = new Date("2026-09-06T09:00:00Z");
      const overdueDays = calculateOverdueDays(todayDate, fixedNow);
      expect(overdueDays).toBe(0);

      const labelInfo = formatFollowUpLabel(todayDate, fixedNow);
      expect(labelInfo.isOverdue).toBe(false);
      expect(labelInfo.isToday).toBe(true);
      expect(labelInfo.label).toBe("Heute fällig");
    });

    it("identifies future items", () => {
      // Future date (2026-09-10)
      const futureDate = new Date("2026-09-10T09:00:00Z");
      const overdueDays = calculateOverdueDays(futureDate, fixedNow);
      expect(overdueDays).toBe(0);

      const labelInfo = formatFollowUpLabel(futureDate, fixedNow);
      expect(labelInfo.isOverdue).toBe(false);
      expect(labelInfo.isToday).toBe(false);
      expect(labelInfo.label).toContain("Fällig am");
    });
  });
});
