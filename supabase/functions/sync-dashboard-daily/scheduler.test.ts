import { describe, expect, it } from "vitest";
import {
  dateInTimeZone,
  getLastCompleteDaysRange,
  isSuccessfulSync,
  uniqueAutomatedClients,
} from "./scheduler.ts";

describe("dashboard daily scheduler", () => {
  it("uses Sao Paulo calendar dates and excludes the current day", () => {
    const now = new Date("2026-09-23T03:30:00.000Z");
    expect(dateInTimeZone(now)).toBe("2026-09-23");
    expect(getLastCompleteDaysRange(now, 7)).toEqual({
      startDate: "2026-09-16",
      endDate: "2026-09-22",
    });
  });

  it("handles month and year boundaries", () => {
    expect(
      getLastCompleteDaysRange(new Date("2027-01-02T12:00:00.000Z"), 7),
    ).toEqual({ startDate: "2026-12-26", endDate: "2027-01-01" });
  });

  it("deduplicates active clients returned through multiple source accounts", () => {
    const maria = {
      source: "google_ads",
      active: true,
      automation_enabled: true,
      dashboard_clients: {
        id: 2,
        slug: "maria-gasolina",
        name: "Maria Gasolina",
        active: true,
      },
    };

    expect(uniqueAutomatedClients([
      maria,
      maria,
      {
        source: "google_ads",
        active: true,
        automation_enabled: false,
        dashboard_clients: {
          id: 3,
          slug: "gt-mais-test",
          name: "GT+ Test",
          active: true,
        },
      },
    ])).toEqual([
      { id: 2, slug: "maria-gasolina", name: "Maria Gasolina" },
    ]);
  });

  it("distinguishes successful and failed downstream syncs", () => {
    expect(isSuccessfulSync(true, true)).toBe(true);
    expect(isSuccessfulSync(false, true)).toBe(false);
    expect(isSuccessfulSync(true, false)).toBe(false);
  });
});
