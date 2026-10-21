import { describe, expect, it } from "vitest";
import { getPlaceComparisonSnapshot, comparablePlaceSeries, type PlaceComparisonSnapshot } from "./place-comparison";
import { isPlaceFront, placeFrontIds } from "./fronts";
import { totals } from "./metrics";
import type { DashboardData } from "./use-dashboard";
import type { FrontDaily } from "../types";

const rows: FrontDaily[] = [
  { front: "condominium", channel: "meta_ads", date: "2026-09-01", spend: 90, leads: 3, clicks: 20, impressions: 100, reach: 80 },
  { front: "condominium", channel: "google_ads", date: "2026-09-02", spend: 10, leads: 2, clicks: 10, impressions: 80, reach: 0 },
];
const data = { condominium: { rows }, campaigns: [], paidOrigin: "supabase", isLoading: false, isError: false } as unknown as DashboardData;
const snapshot = (front: "condominium" | "company"): PlaceComparisonSnapshot => ({ front, status: "available", metrics: totals(rows), campaigns: [], origin: "supabase", series: [{ date: "2026-09-01", leads: 3 }, { date: "2026-09-02", leads: 2 }] });

describe("contrato de comparação de Place", () => {
  it("expõe somente as quatro frentes de Place, sem alterar os identificadores", () => {
    expect(placeFrontIds).toEqual(["condominium", "company", "gym", "hospital"]);
    expect(isPlaceFront("franchise")).toBe(false);
  });
  it("reutiliza os cálculos existentes e filtra o mesmo canal, sem modificar a entrada", () => {
    const before = JSON.stringify(data);
    expect(getPlaceComparisonSnapshot("condominium", data, "all").metrics).toEqual(totals(rows));
    expect(getPlaceComparisonSnapshot("condominium", data, "meta_ads").metrics).toEqual(totals(rows.slice(0, 1)));
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each(["company", "gym", "hospital"] as const)("%s não lê nem herda dados de Condomínios", (front) => {
    const trap = new Proxy({} as DashboardData, { get() { throw new Error("Não pode acessar dados de outra frente"); } });
    const result = getPlaceComparisonSnapshot(front, trap, "all");
    expect(result.status).toBe("unassociated");
    expect(result.metrics).toBeNull(); expect(result.series).toEqual([]); expect(result.campaigns).toEqual([]);
  });
  it("distingue falta de registros, carregamento, erro e zero efetivamente registrado", () => {
    expect(getPlaceComparisonSnapshot("condominium", undefined, "all").status).toBe("loading");
    expect(getPlaceComparisonSnapshot("condominium", { ...data, isError: true }, "all").metrics).toBeNull();
    const empty = { ...data, condominium: { ...data.condominium, rows: [] } };
    expect(getPlaceComparisonSnapshot("condominium", empty, "all").status).toBe("empty");
    expect(getPlaceComparisonSnapshot("condominium", empty, "all").metrics).toBeNull();
    const zero = { ...data, condominium: { ...data.condominium, rows: [{ ...rows[0], spend: 0, leads: 0 }] } };
    expect(getPlaceComparisonSnapshot("condominium", zero, "all").metrics?.spend).toBe(0);
    expect(getPlaceComparisonSnapshot("condominium", zero, "all").metrics?.cpl).toBeNull();
  });
  it("não sobrepõe séries sem cobertura equivalente nem preenche dias ausentes", () => {
    const a = snapshot("condominium"); const b = snapshot("company");
    expect(comparablePlaceSeries(a, { ...b, status: "unassociated" })).toEqual([]);
    expect(comparablePlaceSeries(a, { ...b, origin: "demo" })).toEqual([]);
    expect(comparablePlaceSeries(a, { ...b, series: b.series.slice(0, 1) })).toEqual([]);
    expect(comparablePlaceSeries(a, { ...b, series: [{ date: "2026-09-01", leads: 3 }, { date: "2026-09-03", leads: 4 }] })).toEqual([]);
    expect(comparablePlaceSeries(a, a)).toEqual([]);
    expect(comparablePlaceSeries(a, b)).toEqual([{ date: "2026-09-01", a: 3, b: 3 }, { date: "2026-09-02", a: 2, b: 2 }]);
  });
});
