import { describe, expect, it } from "vitest";
import { initialReportingRange, reportingToday, shiftReportingDay, todayReportingRange } from "./reporting-period";
describe("Sao Paulo reporting calendar", () => {
  it("uses the previous Sao Paulo day before 03:00 UTC", () => {
    expect(reportingToday(new Date("2026-10-28T02:59:59Z"))).toBe("2026-10-27");
    expect(reportingToday(new Date("2026-10-28T03:00:00Z"))).toBe("2026-10-28");
  });
  it("keeps the initial range ending yesterday and makes Hoje explicit", () => {
    expect(initialReportingRange(new Date("2026-10-27T12:00:00Z"))).toEqual({ start: "2026-09-27", end: "2026-10-26" });
    expect(todayReportingRange("2026-10-27")).toEqual({ start: "2026-10-27", end: "2026-10-27" });
    expect(shiftReportingDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});
