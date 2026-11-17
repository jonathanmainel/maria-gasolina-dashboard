import { describe, expect, it } from "vitest";
import { historyDates, summarizeOrganic, summarizePaid, type PaidCampaignDay } from "./retaguarda";

const campaign: PaidCampaignDay = {
  source: "google_ads",
  account_id: "01",
  campaign_id: "marca-sem-frente",
  metric_date: "2026-11-10",
  impressions: 3,
  clicks: 0,
  conversions: 0.25,
};

describe("dados diários da Retaguarda", () => {
  it("inclui campanhas sem frente e deduplica a chave de plataforma, conta, campanha e dia", () => {
    const result = summarizePaid([
      campaign, campaign,
      { ...campaign, account_id: "02", impressions: 7, conversions: 0.5 },
      { ...campaign, metric_date: "2026-11-12", impressions: 2, conversions: 0 },
      { ...campaign, campaign_id: "outra-campanha", impressions: 2, conversions: 1 },
    ]);
    expect(result.days.get("2026-11-10")).toEqual({ impressions: 12, clicks: 0, conversions: 1.75 });
    expect(result.days.has("2026-11-11")).toBe(false);
    expect(result.total).toEqual({ impressions: 14, clicks: 0, conversions: 1.75 });
  });

  it("preserva zero confirmado e ausência por métrica", () => {
    expect(summarizePaid([]).total).toEqual({ impressions: null, clicks: null, conversions: null });
    expect(summarizePaid([{ ...campaign, source: "meta_ads", impressions: null, conversions: 0 }]).total)
      .toEqual({ impressions: null, clicks: 0, conversions: 0 });
  });

  it("soma apenas canais orgânicos do GA4 e identifica os canais presentes", () => {
    const day = "2026-11-10";
    const result = summarizeOrganic([
      { metric_date: day, channel_group: "Organic Search", sessions: 5 },
      { metric_date: day, channel_group: "Organic Social", sessions: 4 },
      { metric_date: day, channel_group: "Paid Search", sessions: 30 },
      { metric_date: "2026-11-12", channel_group: "Organic Video", sessions: 0 },
    ]);
    expect(result.total).toBe(9);
    expect(result.days.get(day)).toBe(9);
    expect(result.days.get("2026-11-12")).toBe(0);
    expect(result.days.get("2026-11-11")).toBeUndefined();
    expect(result.channelLabels).toEqual(["Busca orgânica", "Redes sociais orgânicas", "Vídeo orgânico"]);
    expect(summarizeOrganic([]).total).toBeNull();
  });

  it("inclui os dois limites e dias intermediários na mudança de mês", () => {
    expect(historyDates({ start: "2026-10-30", end: "2026-11-01" })).toEqual(["2026-11-01", "2026-10-31", "2026-10-30"]);
    expect(historyDates({ start: "2026-12-31", end: "2026-12-31" })).toEqual(["2026-12-31"]);
  });
});
