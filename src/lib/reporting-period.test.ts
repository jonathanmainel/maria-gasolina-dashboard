import { describe, expect, it } from "vitest";
import { comparisonPeriod, initialReportingRange, monthToDate, nextReportingMidnight, reportingToday, todayReportingRange } from "./reporting-period";

describe("calendário de Brasília", () => {
  it("vira o mês e o ano à meia-noite de São Paulo", () => {
    const before = new Date("2027-01-01T02:59:59Z");
    const midnight = new Date("2027-01-01T03:00:00Z");
    expect(reportingToday(before)).toBe("2026-12-31");
    expect(nextReportingMidnight(+before)).toBe(+midnight);
    expect(initialReportingRange(before)).toEqual({ start: "2026-12-01", end: "2026-12-31" });
    expect(initialReportingRange(midnight)).toEqual(todayReportingRange("2027-01-01"));
  });

  it.each([
    ["2026-12-05", "2026-11-01", "2026-11-05", 5, 5],
    ["2026-12-15", "2026-11-01", "2026-11-15", 15, 15],
    ["2026-12-31", "2026-11-01", "2026-11-30", 31, 30],
    ["2027-03-31", "2027-02-01", "2027-02-28", 31, 28],
    ["2028-03-31", "2028-02-01", "2028-02-29", 31, 29],
    ["2027-01-01", "2026-12-01", "2026-12-01", 1, 1],
    ["2027-04-30", "2027-03-01", "2027-03-30", 30, 30],
  ])("compara MTD em %s com %s a %s", (today, start, end, currentDays, previousDays) => {
    expect(comparisonPeriod(monthToDate(today), "mtd")).toEqual({ previous: { start, end }, currentDays, previousDays });
  });

  it("preserva a duração do intervalo personalizado, inclusive em uma mudança de horário", () => {
    expect(comparisonPeriod({ start: "2026-03-07", end: "2026-03-10" })).toEqual({
      previous: { start: "2026-03-03", end: "2026-03-06" }, currentDays: 4, previousDays: 4,
    });
    const fixed = monthToDate("2027-01-05");
    expect(comparisonPeriod(fixed, "fixed").previous).toEqual({ start: "2026-12-27", end: "2026-12-31" });
  });
});
