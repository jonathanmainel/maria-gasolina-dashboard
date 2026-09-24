import { describe, expect, it } from "vitest";
import { byChannel, dailySeries, inRange, monthLabel, monthlySeries, weeklySeries } from "./metrics";
import type { Channel, FrontDaily } from "../types";

const day = (date: string, spend: number, leads: number, channel: Channel = "meta_ads"): FrontDaily => ({
  date, front: "franchise", channel, spend, impressions: 1000, reach: 800, clicks: 50, leads,
});

describe("série mensal", () => {
  it("1. dias do mesmo mês viram um único ponto", () => {
    const series = monthlySeries([day("2026-08-01", 10, 1), day("2026-08-15", 10, 1), day("2026-08-31", 10, 1)]);
    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("2026-08");
  });

  it("2. meses diferentes geram pontos diferentes", () => {
    const series = monthlySeries([day("2026-07-31", 10, 1), day("2026-08-01", 10, 1), day("2026-09-01", 10, 1)]);
    expect(series.map((m) => m.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("agrupa por mês de calendário, não por blocos de 30 dias", () => {
    // 31/07 e 01/08 estão a um dia de distância, mas em meses diferentes.
    const series = monthlySeries([day("2026-07-31", 50, 5), day("2026-08-01", 70, 7)]);
    expect(series.map((m) => [m.key, m.leads])).toEqual([["2026-07", 5], ["2026-08", 7]]);
  });

  it("3. ordena cronologicamente pela chave, não alfabeticamente pelo rótulo", () => {
    // Entrada fora de ordem; alfabeticamente "ago/26" < "jul/26" < "set/26".
    const series = monthlySeries([day("2026-09-10", 1, 1), day("2026-07-10", 1, 1), day("2026-08-10", 1, 1)]);
    expect(series.map((m) => m.label)).toEqual(["jul/26", "ago/26", "set/26"]);
  });

  it("atravessa a virada de ano em ordem", () => {
    const series = monthlySeries([day("2027-01-05", 1, 1), day("2026-12-20", 1, 1)]);
    expect(series.map((m) => m.label)).toEqual(["dez/26", "jan/27"]);
  });

  it("4–5. soma leads e investimento do mês", () => {
    const [m] = monthlySeries([day("2026-08-01", 120.5, 4), day("2026-08-02", 79.5, 6)]);
    expect(m.leads).toBe(10);
    expect(m.spend).toBeCloseTo(200, 10);
  });

  it("6–7. CPL = investimento do mês / leads do mês, e não a média dos CPLs diários", () => {
    // Dia 1: 100 / 10 = CPL 10. Dia 2: 100 / 2 = CPL 50.
    const [m] = monthlySeries([day("2026-08-01", 100, 10), day("2026-08-02", 100, 2)]);
    expect(m.spend).toBe(200);
    expect(m.leads).toBe(12);
    expect(m.cpl).toBeCloseTo(200 / 12, 10); // 16,666...
    expect(m.cpl).not.toBeCloseTo(30, 1); // (10 + 50) / 2 seria o cálculo errado
  });

  it("8. mês sem leads tem CPL nulo, não zero nem infinito", () => {
    const [m] = monthlySeries([day("2026-08-01", 90, 0), day("2026-08-02", 10, 0)]);
    expect(m.leads).toBe(0);
    expect(m.spend).toBe(100);
    expect(m.cpl).toBeNull();
  });

  it("9. mês parcial soma só os dias dentro do período", () => {
    const all = [
      day("2026-07-01", 999, 99), // fora do período
      day("2026-07-15", 10, 1), day("2026-07-31", 10, 1),
      day("2026-08-10", 20, 2),
      day("2026-09-23", 30, 3),
      day("2026-09-30", 999, 99), // fora do período
    ];
    const series = monthlySeries(inRange(all, { start: "2026-07-15", end: "2026-09-23" }));
    expect(series.map((m) => [m.label, m.spend, m.leads])).toEqual([
      ["jul/26", 20, 2],
      ["ago/26", 20, 2],
      ["set/26", 30, 3],
    ]);
  });

  it("período dentro de um único mês gera um único ponto", () => {
    const series = monthlySeries([day("2026-09-01", 10, 1), day("2026-09-23", 10, 1)]);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe("set/26");
  });

  it("sem linhas, sem pontos", () => {
    expect(monthlySeries([])).toEqual([]);
  });

  it("10. respeita o recorte de canal feito antes da agregação", () => {
    const rows = [
      day("2026-08-01", 100, 10, "meta_ads"), day("2026-08-01", 60, 2, "google_ads"),
      day("2026-09-01", 40, 4, "meta_ads"), day("2026-09-01", 20, 1, "google_ads"),
    ];
    const all = monthlySeries(rows);
    const meta = monthlySeries(byChannel(rows, "meta_ads"));
    const google = monthlySeries(byChannel(rows, "google_ads"));
    expect(meta.map((m) => [m.label, m.spend, m.leads])).toEqual([["ago/26", 100, 10], ["set/26", 40, 4]]);
    expect(google.map((m) => [m.label, m.spend, m.leads])).toEqual([["ago/26", 60, 2], ["set/26", 20, 1]]);
    // Visão geral = Meta + Google, mês a mês, com o CPL recalculado sobre a soma.
    all.forEach((m, i) => {
      expect(m.leads).toBe(meta[i].leads + google[i].leads);
      expect(m.spend).toBe(meta[i].spend + google[i].spend);
      expect(m.cpl).toBeCloseTo((meta[i].spend + google[i].spend) / (meta[i].leads + google[i].leads), 10);
    });
  });

  it("fecha com o total da série diária do mesmo recorte", () => {
    const rows = [day("2026-08-01", 12.3, 1), day("2026-08-02", 45.6, 3), day("2026-09-01", 7.8, 2), day("2026-09-01", 1, 0, "google_ads")];
    const monthly = monthlySeries(rows);
    const daily = dailySeries(rows);
    expect(monthly.reduce((s, m) => s + m.leads, 0)).toBe(daily.reduce((s, d) => s + d.leads, 0));
    expect(monthly.reduce((s, m) => s + m.spend, 0)).toBeCloseTo(daily.reduce((s, d) => s + d.spend, 0), 10);
  });
});

describe("rótulo do mês", () => {
  it("usa abreviação pt-BR com ano de dois dígitos", () => {
    expect(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => monthLabel(`2026-${m}`))).toEqual(
      ["jan/26", "fev/26", "mar/26", "abr/26", "mai/26", "jun/26", "jul/26", "ago/26", "set/26", "out/26", "nov/26", "dez/26"],
    );
  });
});

describe("série semanal inalterada", () => {
  it("continua em blocos de 7 dias com CPL sobre a soma", () => {
    const rows = Array.from({ length: 9 }, (_, i) => day(`2026-08-${String(i + 1).padStart(2, "0")}`, 10, i === 0 ? 10 : 0));
    const weeks = weeklySeries(rows);
    expect(weeks.map((w) => w.label)).toEqual(["01/08", "08/08"]);
    expect(weeks[0]).toMatchObject({ spend: 70, leads: 10, cpl: 7 });
    expect(weeks[1].cpl).toBeNull();
  });
});
