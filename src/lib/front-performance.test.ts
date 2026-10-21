import { describe, expect, it, vi } from "vitest";
import type { FrontDaily } from "../types";
import { byChannel, inRange, totals, weeklySeries } from "./metrics";
import { frontPerformanceSeries } from "./front-performance";

const range = { start: "2026-08-28", end: "2026-09-10" };
const row = (date: string, spend: number, leads: number, channel: FrontDaily["channel"] = "meta_ads"): FrontDaily => ({
  date, front: "condominium", channel, spend, leads, clicks: 100, impressions: 1000, reach: 900,
});
const rows = [row("2026-08-27", 999, 99), row("2026-08-28", 100, 10), row("2026-08-28", 20, 0, "google_ads"), row("2026-08-30", 100, 2), row("2026-09-04", 80, 0), row("2026-09-10", 40, 4, "google_ads"), row("2026-09-11", 999, 99)];

describe("série do gráfico comercial de leads e investimento", () => {
  it("agrupa os canais por dia, sem alterar a entrada nem gerar dias ausentes", () => {
    const before = JSON.stringify(rows);
    const series = frontPerformanceSeries(rows, range, "daily");
    expect(series.map(({ label, spend, leads, cpl }) => ({ label, spend, leads, cpl }))).toEqual([
      { label: "28/08", spend: 120, leads: 10, cpl: 12 },
      { label: "30/08", spend: 100, leads: 2, cpl: 50 },
      { label: "04/09", spend: 80, leads: 0, cpl: null },
      { label: "10/09", spend: 40, leads: 4, cpl: 10 },
    ]);
    expect(series[0].period).toBe("28/08/2026");
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("semanal usa segunda a domingo e recorta as semanas do filtro", () => {
    const series = frontPerformanceSeries(rows, range, "weekly");
    expect(series).toEqual([
      { label: "28/08–30/08", period: "28/08/2026 a 30/08/2026", spend: 220, leads: 12, cpl: 220 / 12 },
      { label: "31/08–06/09", period: "31/08/2026 a 06/09/2026", spend: 80, leads: 0, cpl: null },
      { label: "07/09–10/09", period: "07/09/2026 a 10/09/2026", spend: 40, leads: 4, cpl: 10 },
    ]);
    expect(series[0].cpl).not.toBe((12 + 50) / 2);
    // O agregador legado consumido pelo gráfico menor permanece compatível.
    expect(weeklySeries(inRange(rows, range))).toHaveLength(1);
  });

  it("um bloco final parcial não inclui dias após o fim do intervalo", () => {
    const series = frontPerformanceSeries(rows, { ...range, end: "2026-09-05" }, "weekly");
    expect(series[1]).toMatchObject({ period: "31/08/2026 a 05/09/2026", spend: 80, leads: 0, cpl: null });
  });

  it("lacunas no início não deslocam os blocos nem criam semanas com zero", () => {
    const series = frontPerformanceSeries([row("2026-09-09", 30, 3), row("2026-09-25", 20, 2)], { start: "2026-09-01", end: "2026-09-30" }, "weekly");
    expect(series.map((point) => [point.label, point.period, point.spend])).toEqual([
      ["07/09–13/09", "07/09/2026 a 13/09/2026", 30],
      ["21/09–27/09", "21/09/2026 a 27/09/2026", 20],
    ]);
  });

  it("fecha uma semana completa no domingo e inicia outra na segunda", () => {
    const complete = Array.from({ length: 8 }, (_, i) => row(`2026-09-${String(7 + i).padStart(2, "0")}`, (i + 1) * 10, i + 1));
    const before = JSON.stringify(complete);
    const series = frontPerformanceSeries(complete.reverse(), { start: "2026-09-07", end: "2026-09-14" }, "weekly");
    expect(series).toEqual([
      { label: "07/09–13/09", period: "07/09/2026 a 13/09/2026", spend: 280, leads: 28, cpl: 10 },
      { label: "14/09", period: "14/09/2026", spend: 80, leads: 8, cpl: 10 },
    ]);
    expect(JSON.stringify([...complete].reverse())).toBe(before);
  });

  it("recorta as duas pontas no meio da semana sem incluir registros externos", () => {
    const data = [row("2026-09-08", 999, 99), row("2026-09-09", 12, 2), row("2026-09-13", 30, 3), row("2026-09-14", 50, 2), row("2026-09-17", 20, 0), row("2026-09-18", 999, 99)];
    expect(frontPerformanceSeries(data, { start: "2026-09-09", end: "2026-09-17" }, "weekly")).toEqual([
      { label: "09/09–13/09", period: "09/09/2026 a 13/09/2026", spend: 42, leads: 5, cpl: 42 / 5 },
      { label: "14/09–17/09", period: "14/09/2026 a 17/09/2026", spend: 70, leads: 2, cpl: 35 },
    ]);
  });

  it("mantem a mesma semana na virada do ano e nao duplica canais ou datas", () => {
    const data = [row("2027-01-04", 90, 3), row("2026-12-31", 40, 4), row("2027-01-03", 30, 0), row("2026-12-28", 10, 1), row("2026-12-31", 20, 1, "google_ads")];
    const before = JSON.stringify(data);
    const selectedRange = { start: "2026-12-28", end: "2027-01-04" };
    const series = frontPerformanceSeries(data, selectedRange, "weekly");
    expect(series).toEqual([
      { label: "28/12–03/01", period: "28/12/2026 a 03/01/2027", spend: 100, leads: 6, cpl: 100 / 6 },
      { label: "04/01", period: "04/01/2027", spend: 90, leads: 3, cpl: 30 },
    ]);
    expect(series.reduce((sum, point) => sum + point.spend, 0)).toBe(totals(data).spend);
    expect(series.reduce((sum, point) => sum + point.leads, 0)).toBe(totals(data).leads);
    expect(JSON.stringify(data)).toBe(before);
  });

  it.each(["America/Sao_Paulo", "UTC", "Pacific/Kiritimati", "America/Los_Angeles"])("preserva as datas sem deslocamento em %s, inclusive no horario de verao", (timezone) => {
    try {
      vi.stubEnv("TZ", timezone);
      // Em Sao Paulo, 04/11/2018 teve transicao do horario de verao.
      const data = [row("2018-11-04", 25, 2), row("2018-11-05", 15, 3)];
      expect(frontPerformanceSeries(data, { start: "2018-11-01", end: "2018-11-07" }, "weekly")).toEqual([
        { label: "01/11–04/11", period: "01/11/2018 a 04/11/2018", spend: 25, leads: 2, cpl: 12.5 },
        { label: "05/11–07/11", period: "05/11/2018 a 07/11/2018", spend: 15, leads: 3, cpl: 5 },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("soma meses parciais e calcula o CPL dos totais, sem média de taxas", () => {
    const series = frontPerformanceSeries(rows, range, "monthly");
    expect(series).toEqual([
      { label: "ago/26", period: "28/08/2026 a 31/08/2026", spend: 220, leads: 12, cpl: 220 / 12 },
      { label: "set/26", period: "01/09/2026 a 10/09/2026", spend: 120, leads: 4, cpl: 30 },
    ]);
  });

  it.each(["daily", "weekly", "monthly"] as const)("%s fecha com os totais usados pelos cards", (mode) => {
    const series = frontPerformanceSeries(rows, range, mode);
    const cards = totals(inRange(rows, range));
    expect(cards.spend).toBe(340); expect(cards.leads).toBe(16); expect(cards.cpl).toBe(21.25);
    expect(series.reduce((sum, point) => sum + point.spend, 0)).toBe(cards.spend);
    expect(series.reduce((sum, point) => sum + point.leads, 0)).toBe(cards.leads);
    for (const point of series) expect(point.cpl).toBe(point.leads ? point.spend / point.leads : null);
  });

  it.each(["daily", "weekly", "monthly"] as const)("%s respeita o filtro de plataforma e a ausência de linhas", (mode) => {
    const series = frontPerformanceSeries(byChannel(rows, "google_ads"), range, mode);
    expect(series.reduce((sum, point) => sum + point.spend, 0)).toBe(60);
    expect(series.reduce((sum, point) => sum + point.leads, 0)).toBe(4);
    expect(frontPerformanceSeries([], range, mode)).toEqual([]);
  });

  it.each(["daily", "weekly", "monthly"] as const)("%s mostra CPL indisponível com investimento e nenhum lead", (mode) => {
    const [point] = frontPerformanceSeries([row("2026-08-30", 100, 0)], range, mode);
    expect(point).toMatchObject({ spend: 100, leads: 0, cpl: null });
  });

  it("ordena datas fora de ordem e preserva valores decimais", () => {
    const series = frontPerformanceSeries([row("2026-09-10", 0.2, 1), row("2026-08-28", 0.1, 2)], range, "monthly");
    expect(series.map((point) => point.label)).toEqual(["ago/26", "set/26"]);
    expect(series.reduce((sum, point) => sum + point.spend, 0)).toBeCloseTo(0.3, 12);
  });
});
