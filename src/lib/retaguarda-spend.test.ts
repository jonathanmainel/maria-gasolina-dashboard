import { describe, expect, it } from "vitest";
import { shiftReportingDay } from "./reporting-period";
import { consolidateSpend, estimateAutonomy, hasRecentBalance, summarizeAccountSpend, type SpendDay } from "./retaguarda-spend";

const today = "2026-11-17";
const rows: SpendDay[] = Array.from({ length: 7 }, (_, index) => ({
  source: "google_ads", account_id: "a", metric_date: shiftReportingDay(today, index - 7),
  spend: 10.000001, extra_metrics: { currency_code: "BRL" }, ingested_at: "2026-11-17T04:00:08Z",
}));
const summarize = (days: SpendDay[]) => summarizeAccountSpend(days, "google_ads", "a", today);

describe("estimativa por conta e data de coleta", () => {
  it("usa a janela de sete dias completos, exclui hoje e separa plataformas e contas", () => {
    expect(summarize([...rows, ...rows.map(row => ({ ...row, account_id: "b", spend: 200 })),
      { ...rows[0], source: "meta_ads", spend: 200 }, { ...rows[0], metric_date: today, spend: 500 }])).toEqual({
      start: "2026-11-10", end: "2026-11-16", estimate: 10.000001, validDays: 7,
      lastCollection: "2026-11-17T04:00:08Z", unverifiedCurrency: false,
    });
  });

  it("não troca dias ausentes pelo histórico antigo nem transforma NULL em zero", () => {
    const missing = [...rows.slice(2), { ...rows[0], spend: null }, { ...rows[1], metric_date: "2026-11-09" }];
    expect(summarize(missing)).toMatchObject({ validDays: 5, estimate: null, unverifiedCurrency: false });
    expect(summarize(rows.map(row => ({ ...row, spend: 0 })))).toMatchObject({ validDays: 7, estimate: 0 });
  });

  it("não usa um dia cuja última coleta ocorreu antes de seu fechamento em São Paulo", () => {
    expect(summarize([...rows.slice(0, 6), { ...rows[6], ingested_at: "2026-11-17T02:59:00Z" }]))
      .toMatchObject({ validDays: 6, estimate: null });
  });

  it("ignora duplicatas idênticas e impede dupla contagem quando os dados conflitam", () => {
    expect(summarize([...rows, ...rows])).toMatchObject({ validDays: 7, estimate: 10.000001 });
    expect(summarize([...rows, { ...rows[0], spend: 75 }])).toMatchObject({ validDays: 6, estimate: null });
  });

  it("não mistura moedas nem presume BRL para linhas antigas sem metadado", () => {
    expect(summarize([rows[0], { ...rows[1], extra_metrics: {} },
      { ...rows[2], extra_metrics: { currency_code: "USD" } }, ...rows.slice(3)]))
      .toMatchObject({ validDays: 5, estimate: null, unverifiedCurrency: true });
  });

  it("consolida somente contas completas e calcula autonomia com saldo recente e consumo positivo", () => {
    expect(consolidateSpend([10, 15, 0])).toBe(25);
    expect(consolidateSpend([10, null])).toBeNull();
    expect(consolidateSpend([])).toBeNull();
    expect(estimateAutonomy(100, 25, true)).toBe(4);
    expect(estimateAutonomy(0, 25, true)).toBe(0);
    expect(estimateAutonomy(100, 0, true)).toBeNull();
    expect(estimateAutonomy(null, 25, true)).toBeNull();
    expect(estimateAutonomy(100, 25, false)).toBeNull();
  });

  it("exige data de referência e medição recentes no fuso de São Paulo", () => {
    expect(hasRecentBalance("2026-11-16", "2026-11-17T01:00:00Z", today)).toBe(true);
    expect(hasRecentBalance("2026-11-15", "2026-11-17T04:00:00Z", today)).toBe(false);
    expect(hasRecentBalance(today, "2026-11-16T01:00:00Z", today)).toBe(false);
    expect(hasRecentBalance(today, "2026-11-19T04:00:00Z", today)).toBe(false);
    expect(hasRecentBalance(today, null, today)).toBe(false);
  });
});
