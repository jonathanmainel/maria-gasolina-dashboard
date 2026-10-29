// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCrmSummary } from "../lib/crm";
import { defaultManualData } from "../lib/manual-inputs";
import { emptyTotals, totals } from "../lib/metrics";
import type { DashboardData } from "../lib/use-dashboard";
import type { CampaignRow, Front, FrontDaily } from "../types";
import { FrontView } from "./FrontView";

vi.mock("../lib/supabase", () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock("../lib/goals", () => ({ useGoals: vi.fn(() => defaultManualData.goals) }));
vi.mock("../lib/api", async (original) => ({
  ...await original<typeof import("../lib/api")>(),
  getAllEntities: vi.fn(async () => ({ items: [], truncated: false })),
  getAllPmax: vi.fn(async () => ({ items: [], truncated: false })),
  getClientId: vi.fn(async () => 1),
}));

import { getAllEntities, getAllPmax } from "../lib/api";
import { useGoals } from "../lib/goals";

beforeAll(() => {
  window.matchMedia ??= ((media: string) => ({ matches: true, media, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const range = { start: "2026-09-01", end: "2026-09-30" };
const row = (front: Front, channel: "meta_ads" | "google_ads", spend: number, leads: number): FrontDaily => ({
  date: "2026-09-03", front, channel, spend, leads, clicks: 100, impressions: 1000, reach: 900,
});
const rows = [row("franchise", "meta_ads", 120, 6), row("franchise", "google_ads", 80, 2), row("condominium", "meta_ads", 90, 3), row("condominium", "google_ads", 60, 2)];
const frontData = (front: Front) => ({ current: totals(rows.filter((r) => r.front === front)), previous: { ...emptyTotals, spend: 50, leads: 1, cpl: 50 }, rows: rows.filter((r) => r.front === front), prevRows: [row(front, "meta_ads", 50, 1)] });
const campaign = (front: Front): CampaignRow => ({ id: front, name: `Campanha existente ${front}`, front, channel: "meta_ads", objective: "Leads", status: "ACTIVE", spend: 90, leads: 3, clicks: 100, impressions: 1000, cpl: 30, cpc: .9, ctr: 10 });
const crm = (front: Front) => buildCrmSummary(front, { stages: {}, stage_days: {}, avg_ticket: 0 }, { contracts_closed: 0, revenue: 0 }, { rows: [] });
const data = { franchise: frontData("franchise"), condominium: frontData("condominium"), campaigns: [campaign("franchise"), campaign("condominium")], creatives: [], crm: { franchise: crm("franchise"), condominium: crm("condominium") } } as unknown as DashboardData;

function show(front: "franchise" | "condominium" | "company" | "gym" | "hospital", passedData: DashboardData = data) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FrontView front={front} data={passedData} range={range} onNavigate={() => {}} /></QueryClientProvider>);
}
const kpiArticle = (name: string) => screen.getAllByText(name, { exact: true }).find((element) => element.closest(".kpi"))!.closest("article")!;
const kpi = (name: string) => within(kpiArticle(name));
const kpiValue = (name: string) => kpiArticle(name).querySelector(".kpi-value strong")!.textContent;

describe("frentes sem fonte associada", () => {
  it.each([["company", "Empresas"], ["gym", "Academias"], ["hospital", "Hospitais"]] as const)("%s ignora dados de outras frentes, inclusive quando fornecidos", (front, label) => {
    show(front);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(label);
    expect(screen.getAllByRole("status").map(node => node.textContent).join(" ")).toContain("Dados ainda não disponíveis");
    const sections = [...document.querySelectorAll<HTMLDetailsElement>(".unavailable-section")];
    expect(sections).toHaveLength(3);
    expect(sections.every((section) => !section.open)).toBe(true);
    expect(document.querySelectorAll(".kpi-value strong")).toHaveLength(6);
    document.querySelectorAll(".kpi-value strong").forEach((value) => expect(value.textContent).toBe("—"));
    expect(screen.getByText("Nenhuma campanha vinculada a esta frente.")).not.toBeNull();
    expect(screen.queryByText(/Campanha existente/)).toBeNull();
    expect(document.querySelector(".recharts-wrapper")).toBeNull();
    expect(document.querySelector(".creative-ranking")).toBeNull();
    expect(screen.getByText(/Funil comercial/)).not.toBeNull();
    expect(document.querySelectorAll(".funnel3d-row-bottom b")).toHaveLength(8);
    document.querySelectorAll(".funnel3d-row-bottom b").forEach(value => expect(value.textContent).toBe("—"));
    expect(document.body.textContent).not.toMatch(/R\$|0 leads|0 campanhas/);
    expect(useGoals).not.toHaveBeenCalled();
  });

  it("troca filtros e níveis sem buscar campanhas ou reutilizar o cache de outra frente", async () => {
    show("company");
    fireEvent.click(screen.getByText("Campanhas e detalhamento", { exact: true }));
    fireEvent.click(screen.getByText("Indicadores de mídia", { exact: true }));
    fireEvent.click(screen.getByRole("tab", { name: "Palavras-chave" }));
    fireEvent.click(screen.getByRole("tab", { name: "Meta Ads" }));
    expect(screen.queryByRole("tab", { name: "Palavras-chave" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Campanhas" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Anúncios" }));
    fireEvent.click(screen.getByRole("tab", { name: "Google Ads" }));
    fireEvent.click(screen.getByRole("tab", { name: "Mensal" }));
    await Promise.resolve();
    expect(getAllEntities).not.toHaveBeenCalled();
    expect(getAllPmax).not.toHaveBeenCalled();
    expect(kpi("Investimento").getByText("—")).not.toBeNull();
  });
});

describe("compatibilidade das frentes conectadas", () => {
  it.each([["franchise", "R$ 200,00", "8", "R$ 25,00", "R$ 120,00", "6"], ["condominium", "R$ 150,00", "5", "R$ 30,00", "R$ 90,00", "3"]] as const)("%s preserva totais, campanha, comparação e filtro", (front, spend, leads, cpl, metaSpend, metaLeads) => {
    const before = JSON.stringify(data);
    show(front);
    expect(kpiValue("Investimento")).toBe(spend);
    expect(kpiValue(front === "franchise" ? "Leads (candidatos)" : "Leads (indicações)")).toBe(leads);
    expect(kpiValue("Custo por lead")).toBe(cpl);
    expect(kpi("Investimento").getByText(/no período anterior/)).not.toBeNull();
    expect(screen.getAllByText(`Campanha existente ${front}`).length).toBeGreaterThan(0);
    expect(screen.queryByText(`Campanha existente ${front === "franchise" ? "condominium" : "franchise"}`)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Meta Ads" }));
    expect(kpiValue("Investimento")).toBe(metaSpend);
    expect(kpiValue(front === "franchise" ? "Leads (candidatos)" : "Leads (indicações)")).toBe(metaLeads);
    expect(JSON.stringify(data)).toBe(before);
  });
});
