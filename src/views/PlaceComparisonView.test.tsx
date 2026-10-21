// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FrontView } from "./FrontView";
import type { CommercialFront, FrontDaily } from "../types";
import type { DashboardData } from "../lib/use-dashboard";
import { defaultManualData } from "../lib/manual-inputs";
import { totals } from "../lib/metrics";
import { buildCrmSummary } from "../lib/crm";

vi.mock("../lib/supabase", () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock("../lib/goals", () => ({ useGoals: () => defaultManualData.goals }));
vi.mock("../lib/api", async (original) => ({ ...await original<typeof import("../lib/api")>(), getAllEntities: vi.fn(async () => ({ items: [], truncated: false })), getAllPmax: vi.fn(async () => ({ items: [], truncated: false })) }));
beforeAll(() => {
  window.matchMedia ??= ((media: string) => ({ matches: true, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const range = { start: "2026-09-01", end: "2026-09-30" };
const rows: FrontDaily[] = [
  { date: "2026-09-02", front: "condominium", channel: "meta_ads", spend: 90, leads: 3, clicks: 50, impressions: 500, reach: 400 },
  { date: "2026-09-03", front: "condominium", channel: "google_ads", spend: 10, leads: 2, clicks: 10, impressions: 100, reach: 0 },
];
const bundle = { rows, prevRows: rows, current: totals(rows), previous: totals(rows) };
const crm = (front: "condominium" | "franchise") => buildCrmSummary(front, { stages: {}, stage_days: {}, avg_ticket: 0 }, { contracts_closed: 0, revenue: 0 }, { rows: [] });
const data = { condominium: bundle, franchise: bundle, campaigns: [], creatives: [], crm: { condominium: crm("condominium"), franchise: crm("franchise") }, isLoading: false, isError: false, paidOrigin: "supabase" } as unknown as DashboardData;
function show(front: CommercialFront, source = data) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (next: CommercialFront) => <QueryClientProvider client={client}><FrontView front={next} data={source} range={range} onNavigate={() => {}} /></QueryClientProvider>;
  const result = render(ui(front));
  return { ...result, changeFront: (next: CommercialFront) => result.rerender(ui(next)) };
}
const open = () => { fireEvent.click(screen.getByRole("button", { name: "Comparar frentes" })); return within(screen.getByTestId("place-comparison")); };
const metric = (side: "A" | "B", front: string, name: string) => screen.getByRole("group", { name: `${name} · Frente ${side} · ${front}` }).querySelector(".kpi-value strong")!.textContent;

describe("modo Comparar frentes", () => {
  it.each([["condominium", "condominium", "company"], ["company", "company", "condominium"], ["gym", "gym", "condominium"], ["hospital", "hospital", "condominium"]] as const)("abre em %s sem criar uma nova página", (front, first, second) => {
    show(front); const comparison = open();
    expect(comparison.getByLabelText("Frente A").getAttribute("id")).toBe("place-front-a");
    expect((comparison.getByLabelText("Frente A") as HTMLSelectElement).value).toBe(first);
    expect((comparison.getByLabelText("Frente B") as HTMLSelectElement).value).toBe(second);
    expect(screen.getByTestId("front-individual").hidden).toBe(true);
    expect(comparison.queryByRole("option", { name: "Franquias" })).toBeNull();
  });
  it("apresenta Condomínios com os mesmos totais e Empresas sem resultados, sem conclusões", () => {
    show("condominium"); const comparison = open();
    expect(metric("A", "Condomínios", "Investimento")).toBe("R$ 100,00");
    expect(metric("A", "Condomínios", "Leads")).toBe("5");
    expect(metric("A", "Condomínios", "CPL")).toBe("R$ 20,00");
    expect(metric("B", "Empresas", "Investimento")).toBe("—");
    expect(comparison.getByText(/A comparação temporal será exibida/)).not.toBeNull();
    expect(screen.getByTestId("place-comparison").querySelector(".delta")).toBeNull();
    expect(comparison.queryByText(/vencedor|melhor frente|recomendamos/i)).toBeNull();
  });
  it("altera ambos os seletores, bloqueia a mesma frente e trata duas fontes ausentes", () => {
    show("company"); const comparison = open();
    const first = comparison.getByLabelText("Frente A") as HTMLSelectElement;
    const second = comparison.getByLabelText("Frente B") as HTMLSelectElement;
    expect(within(second).getByRole("option", { name: "Empresas" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(second, { target: { value: "company" } });
    expect(second.value).toBe("condominium");
    fireEvent.change(second, { target: { value: "hospital" } });
    fireEvent.change(first, { target: { value: "gym" } });
    expect(metric("A", "Academias", "Leads")).toBe("—");
    expect(metric("B", "Hospitais", "Leads")).toBe("—");
    fireEvent.change(first, { target: { value: "company" } });
    expect(metric("A", "Empresas", "CPL")).toBe("—");
    expect(screen.getByTestId("place-comparison").textContent).not.toContain("R$");
  });
  it("restaura a análise individual e mantém plataforma, escala e detalhamento", () => {
    show("condominium");
    fireEvent.click(screen.getByRole("tab", { name: "Meta Ads" }));
    fireEvent.click(screen.getByRole("tab", { name: "Mensal" }));
    fireEvent.click(screen.getByRole("tab", { name: "Anúncios" }));
    const before = screen.getByTestId("front-individual").querySelector(".kpi-value strong")!.textContent;
    const comparison = open();
    expect(comparison.getByRole("tab", { name: "Meta Ads" }).getAttribute("aria-selected")).toBe("true");
    expect(metric("A", "Condomínios", "Investimento")).toBe(before);
    fireEvent.click(comparison.getByRole("button", { name: "Encerrar comparação" }));
    expect(screen.queryByTestId("place-comparison")).toBeNull();
    expect(screen.getByRole("tab", { name: "Mensal" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Anúncios" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Meta Ads" }).getAttribute("aria-selected")).toBe("true");
  });
  it("mantém a comparação e a escala individual durante a troca do período", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (source: DashboardData, period = range) => <QueryClientProvider client={client}><FrontView front="condominium" data={source} range={period} onNavigate={() => {}} /></QueryClientProvider>;
    const view = render(ui(data));
    fireEvent.click(screen.getByRole("tab", { name: "Mensal" }));
    open();
    view.rerender(ui({ ...data, isLoading: true }, { start: "2026-09-02", end: "2026-09-30" }));
    expect(screen.getByRole("heading", { name: "Comparar frentes", level: 1 })).not.toBeNull();
    expect(metric("A", "Condomínios", "Investimento")).toBe("—");
    view.rerender(ui(data));
    fireEvent.click(screen.getByRole("button", { name: "Encerrar comparação" }));
    expect(screen.getByRole("tab", { name: "Mensal" }).getAttribute("aria-selected")).toBe("true");
  });
  it("o filtro de plataforma é compartilhado com a análise de origem", () => {
    show("condominium"); const comparison = open();
    fireEvent.click(comparison.getByRole("tab", { name: "Google Ads" }));
    expect(metric("A", "Condomínios", "Investimento")).toBe("R$ 10,00");
    fireEvent.click(comparison.getByRole("button", { name: "Encerrar comparação" }));
    expect(screen.getByRole("tab", { name: "Google Ads" }).getAttribute("aria-selected")).toBe("true");
  });
  it("encerra ao alterar a frente de origem e não disponibiliza a ação para Franquias", () => {
    const view = show("company"); open(); view.changeFront("gym");
    expect(screen.queryByTestId("place-comparison")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Academias");
    view.changeFront("franchise");
    expect(screen.queryByRole("button", { name: "Comparar frentes" })).toBeNull();
  });
  it.each([{ ...data, isLoading: true }, { ...data, isError: true }])("não apresenta números de Condomínios durante carregamento ou erro", (source) => {
    show("company", source); open(); expect(metric("B", "Condomínios", "Leads")).toBe("—");
  });
});
