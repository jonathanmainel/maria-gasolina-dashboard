import { describe, expect, it } from "vitest";
import { buildCrmSummary } from "./crm";
import type { FrontDaily, ManualFunnelInput } from "../types";

const input: ManualFunnelInput = {
  stages: [400, 240, 120, 60, 30, 20],
  stage_days: [3, 6, 9, 12, 17],
  avg_ticket: 80000,
};

const rows: FrontDaily[] = [
  { date: "2026-08-10", front: "franchise", channel: "meta_ads", spend: 1000, impressions: 10000, reach: 8000, clicks: 200, leads: 60 },
  { date: "2026-08-20", front: "franchise", channel: "google_ads", spend: 500, impressions: 4000, reach: 3000, clicks: 100, leads: 40 },
  { date: "2026-09-05", front: "franchise", channel: "meta_ads", spend: 900, impressions: 9000, reach: 7000, clicks: 180, leads: 50 },
];

describe("funil comercial derivado da entrada manual", () => {
  const crm = buildCrmSummary("franchise", input, { rows });

  it("calcula receita, conversão, ciclo e pipeline a partir dos valores-base", () => {
    expect(crm.contracts).toBe(20);
    expect(crm.revenue).toBe(20 * 80000);
    expect(crm.conversion_rate).toBeCloseTo(5, 5);
    expect(crm.avg_cycle_days).toBe(47);
    expect(crm.pipeline_value).toBe(30 * 80000);
    expect(crm.projected_revenue).toBeGreaterThan(0);
  });

  it("monta a série mensal com o volume real de leads de mídia", () => {
    expect(crm.monthly.map((month) => month.leads)).toEqual([100, 50]);
    // 20 contratos sobre 400 leads = 5% aplicados ao volume real de cada mês.
    expect(crm.monthly.map((month) => month.contracts)).toEqual([5, 3]);
  });

  it("distribui os contratos pelas origens reais de mídia", () => {
    expect(crm.sources.map((source) => source.name)).toEqual(["Meta Ads", "Google Ads"]);
    expect(crm.sources.reduce((sum, source) => sum + source.leads, 0)).toBe(150);
  });

  it("não inventa negociações quando o CRM não expõe a lista", () => {
    expect(crm.recent).toEqual([]);
  });

  it("devolve null em vez de NaN quando o funil está zerado", () => {
    const empty = buildCrmSummary("condominium", { stages: [0, 0, 0, 0, 0, 0], stage_days: [0, 0, 0, 0, 0], avg_ticket: 0 }, { rows: [] });
    expect(empty.conversion_rate).toBeNull();
    expect(empty.revenue).toBe(0);
    expect(empty.projected_revenue).toBe(0);
    expect(empty.monthly).toEqual([]);
    expect(empty.sources).toEqual([]);
  });
});
