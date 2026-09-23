import { describe, expect, it } from "vitest";
import {
  dateInTimeZone,
  executeIsolatedTargets,
  getLastCompleteDaysRange,
  isSuccessfulSync,
  uniqueAutomatedTargets,
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

  it("groups enabled Google and Meta targets and excludes disabled test sources", () => {
    const maria = {
      source: "google_ads",
      account_id: "6072699813",
      active: true,
      automation_enabled: true,
      dashboard_clients: {
        id: 2,
        slug: "maria-gasolina",
        name: "Maria Gasolina",
        active: true,
      },
    };

    expect(uniqueAutomatedTargets([
      maria,
      maria,
      {
        source: "meta_ads",
        account_id: "1063721474298569",
        active: true,
        automation_enabled: true,
        dashboard_clients: {
          id: 2,
          slug: "maria-gasolina",
          name: "Maria Gasolina",
          active: true,
        },
      },
      {
        source: "google_ads",
        account_id: "6072699813",
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
      {
        id: 2,
        slug: "maria-gasolina",
        name: "Maria Gasolina",
        source: "google_ads",
        accountIds: ["6072699813"],
      },
      {
        id: 2,
        slug: "maria-gasolina",
        name: "Maria Gasolina",
        source: "meta_ads",
        accountIds: ["1063721474298569"],
      },
    ]);
  });

  it("distinguishes successful and failed downstream syncs", () => {
    expect(isSuccessfulSync(true, true)).toBe(true);
    expect(isSuccessfulSync(false, true)).toBe(false);
    expect(isSuccessfulSync(true, false)).toBe(false);
  });

  it("isolates a Meta failure without skipping Google", async () => {
    const results = await executeIsolatedTargets(
      ["meta_ads", "google_ads"],
      async (source) => {
        if (source === "meta_ads") throw new Error("Meta failed");
        return "success";
      },
    );

    expect(results.map(({ target, ok }) => ({ target, ok }))).toEqual([
      { target: "meta_ads", ok: false },
      { target: "google_ads", ok: true },
    ]);
  });

  it("isolates a Google failure without skipping Meta", async () => {
    const results = await executeIsolatedTargets(
      ["google_ads", "meta_ads"],
      async (source) => {
        if (source === "google_ads") throw new Error("Google failed");
        return "success";
      },
    );

    expect(results.map(({ target, ok }) => ({ target, ok }))).toEqual([
      { target: "google_ads", ok: false },
      { target: "meta_ads", ok: true },
    ]);
  });
});
