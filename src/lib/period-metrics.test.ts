import { expect, it } from "vitest";
import { inRange, totals } from "./metrics";
import { comparisonPeriod, monthToDate } from "./reporting-period";
import type { FrontDaily } from "../types";

it("keeps D0 and fractional conversions in weighted metrics for the selected periods", () => {
  const day = (date: string, spend: number, leadCount: number, clicks: number, impressions: number): FrontDaily =>
    ({ date, front: "franchise", channel: "google_ads", spend, leads: leadCount, clicks, impressions, reach: impressions });
  const range = monthToDate("2026-12-05");
  const { previous } = comparisonPeriod(range, "mtd");
  const rows = [
    day("2026-11-01", 25, 0.5, 10, 100), day("2026-11-05", 60, 1.5, 10, 900),
    day("2026-11-06", 400, 20, 100, 1000),
    day("2026-12-01", 50, 0.5, 5, 50), day("2026-12-05", 210, 2.75, 30, 450),
  ];
  expect(totals(inRange(rows, range))).toMatchObject({ spend: 260, leads: 3.25, cpl: 80, cpm: 520, ctr: 7 });
  expect(totals(inRange(rows, range)).cpc).toBeCloseTo(260 / 35);
  expect(totals(inRange(rows, range)).conv_rate).toBeCloseTo(3.25 * 100 / 35);
  expect(totals(inRange(rows, previous))).toMatchObject({ spend: 85, leads: 2, cpl: 42.5, cpc: 4.25, cpm: 85, ctr: 2, conv_rate: 10 });
});
