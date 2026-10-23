// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoDelivery, demoGoals } from "../data/demo";
import { buildCrmSummary } from "../lib/crm";
import { integer, money } from "../lib/format";
import { emptyTotals, organicSummary, totals } from "../lib/metrics";
import type { DashboardData } from "../lib/use-dashboard";
import type { Front, FrontDaily } from "../types";
import { ExecutiveView } from "./Executive";
import { Presentation } from "./Presentation";

const mode = vi.hoisted(() => ({ demo: false }));
vi.mock("../lib/api", async (original) => ({ ...await original<typeof import("../lib/api")>(), get isDemoMode() { return mode.demo; } }));
vi.mock("../lib/goals", () => ({ useGoals: () => demoGoals }));
vi.mock("../components/DataRefreshPanel", () => ({ DataRefreshPanel: () => null }));
vi.mock("../components/NetworkHero", () => ({ NetworkHero: () => <section>Rede</section> }));
vi.mock("../lib/network-units", () => ({ useNetworkUnits: () => ({ data: null }), toMapCities: () => [] }));
vi.mock("./FrontView", () => ({ CreativeCard: () => null }));
vi.mock("motion/react", async (original) => ({ ...await original<typeof import("motion/react")>(), useReducedMotion: () => true }));

afterEach(() => { cleanup(); mode.demo = false; });
const range = { start: "2026-09-01", end: "2026-09-23" };
const rows: FrontDaily[] = [
  { date: range.end, front: "franchise", channel: "meta_ads", spend: 600, leads: 20, clicks: 100, impressions: 1000, reach: 900 },
  { date: range.end, front: "condominium", channel: "google_ads", spend: 300, leads: 10, clicks: 80, impressions: 900, reach: 800 },
];
const paid = (front: Front) => ({ current: totals(rows.filter((r) => r.front === front)), previous: emptyTotals, rows: rows.filter((r) => r.front === front), prevRows: [] });
const manual = (front: Front, contracts: number, revenue: number) => buildCrmSummary(front, { stages: { lead: 4 }, stage_days: {}, avg_ticket: 0 }, { contracts_closed: contracts, revenue }, { rows });
function fixture(origin: DashboardData["organicOrigin"] | undefined = "demo"): DashboardData {
  return {
    organicOrigin: origin, paidOrigin: "supabase", manualStorage: "supabase",
    all: { current: totals(rows), previous: emptyTotals }, franchise: paid("franchise"), condominium: paid("condominium"),
    current: rows, organicRows: [], organicPrevRows: [], unclassified: { campaigns: [], spend: 0, leads: 0 },
    instagram: { current: { ...organicSummary([], "instagram"), followers: 4321, new_followers: 11, dms: 17 }, previous: organicSummary([], "instagram") },
    facebook: { current: { ...organicSummary([], "facebook"), followers: 1234, new_followers: 7, dms: 13 }, previous: organicSummary([], "facebook") },
    crm: { franchise: manual("franchise", 2, 40000), condominium: manual("condominium", 3, 60000) },
    delivery: demoDelivery, creatives: [], posts: [],
  } as unknown as DashboardData;
}
function kpi(label: string) {
  return screen.getByText(label, { exact: true }).closest(".kpi") as HTMLElement;
}
const value = (label: string) => kpi(label).querySelector(".kpi-value strong")?.textContent;
function executive(data = fixture()) { return render(<ExecutiveView data={data} range={range} onNavigate={() => undefined} />); }
function presentation(data = fixture()) {
  const result = render(<Presentation data={data} range={range} onExit={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
  return result;
}
function organicSlide() { for (let index = 0; index < 3; index++) fireEvent.click(screen.getByRole("button", { name: "Próximo" })); }

describe("origem do Organico nas visualizacoes operacionais", () => {
  it.each(["demo", undefined] as const)("Executiva: origem %s indisponivel, sem somar demonstracao ao mix", (origin) => {
    const data = fixture(); data.organicOrigin = origin as DashboardData["organicOrigin"];
    executive(data);
    for (const label of ["Novos seguidores (IG + FB)", "Novos seguidores"]) {
      expect(value(label)).toBe("—");
      expect(kpi(label).querySelector(".delta")).toBeNull();
      expect(kpi(label).querySelector(".kpi-foot")?.textContent).toContain("Integração orgânica pendente");
    }
    const card = screen.getByRole("link", { name: /Orgânico · Instagram e Facebook/ });
    expect(card.textContent).toContain("Dados reais de Instagram e Facebook ainda não disponíveis");
    expect(card.querySelector(".front-meta")).toBeNull();
    expect(screen.queryByText("Orgânico (DMs + perfil)")).toBeNull();
    expect(screen.queryByText("Modo demonstração.")).toBeNull();
    expect(value("Investimento em mídia")).toBe(money(900));
    expect(value("Leads gerados (todas as frentes)")).toBe("30");
  });

  it("Executiva: fonte real preserva os numeros e o mix organico", () => {
    executive(fixture("supabase"));
    expect(value("Novos seguidores (IG + FB)")).toBe("18");
    expect(screen.getByText("Orgânico (DMs + perfil)")).not.toBeNull();
    expect(screen.queryByText(/Dados reais de Instagram e Facebook ainda não disponíveis/)).toBeNull();
  });

  it("Executiva: zero informado por fonte real continua zero", () => {
    const data = fixture("supabase"); data.instagram.current.new_followers = 0; data.facebook.current.new_followers = 0;
    executive(data);
    expect(value("Novos seguidores (IG + FB)")).toBe("0");
  });

  it("Executiva: demonstracao explicita exibe valores com identificacao", () => {
    mode.demo = true; executive();
    expect(screen.getByText("Modo demonstração.").closest('[role="status"]')?.textContent).toContain("ilustrativos");
    expect(value("Novos seguidores (IG + FB)")).toBe("18");
    expect(screen.getByText("Orgânico (DMs + perfil)")).not.toBeNull();
  });

  it.each(["supabase", "local"] as const)("preserva valores comerciais fornecidos, storage=%s, sem inferir sua origem", (storage) => {
    const data = fixture(); data.manualStorage = storage; const before = JSON.stringify(data.crm);
    executive(data);
    expect(value("Contratos no período")).toBe("5");
    expect(value("Receita no período")).toBe(money(100000));
    expect(JSON.stringify(data.crm)).toBe(before);
  });

  it("Apresentacao: organic demo nao vira resultado; controles e CRM continuam disponiveis", () => {
    presentation();
    expect(value("Novos seguidores")).toBe("—");
    expect(value("Investimento")).toBe(money(900));
    organicSlide();
    expect(screen.getByRole("heading", { name: "Integração orgânica pendente" })).not.toBeNull();
    expect(document.querySelectorAll(".kpi")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(value("Contratos de franquia no período")).toBe("2");
    expect(value("Receita de franquia no período")).toBe(money(40000));
  });

  it("Apresentacao: fonte real mantem seguidores e slide organico", () => {
    presentation(fixture("supabase"));
    expect(value("Novos seguidores")).toBe("18");
    organicSlide();
    expect(value("Seguidores IG")).toBe(integer(4321));
    expect(screen.queryByRole("heading", { name: "Integração orgânica pendente" })).toBeNull();
  });

  it("Apresentacao: demonstracao explicita identifica inclusive o slide organico", () => {
    mode.demo = true; presentation();
    expect(screen.getByRole("status").textContent).toContain("Modo demonstração");
    expect(value("Novos seguidores")).toBe("18");
    organicSlide();
    expect(screen.getByRole("status").textContent).toContain("ilustrativos");
    expect(value("Seguidores IG")).toBe(integer(4321));
  });
});


describe("ausencia comercial nas superficies consolidadas", () => {
  function empty() {
    const data = fixture();
    data.crm = { franchise: buildCrmSummary("franchise", null, null, { rows }), condominium: buildCrmSummary("condominium", null, null, { rows }) };
    return data;
  }
  it("Executiva: nenhum resultado comercial vira zero ou recebe exemplo", () => {
    executive(empty());
    for (const label of ["Contratos no período", "Receita no período", "Oportunidades abertas", "Ticket médio · franquias"]) expect(value(label)).toBe("—");
    expect(screen.getAllByText("Aguardando integração com CRM Elo.").length).toBeGreaterThan(0);
    expect(value("Investimento em mídia")).toBe(money(900));
    expect(value("Leads gerados (todas as frentes)")).toBe("30");
    expect(document.querySelector(".proj-total")).toBeNull();
  });
  it("Apresentacao: etapas preservadas sem volumes, mantendo os indicadores de midia", () => {
    presentation(empty());
    expect(value("Investimento")).toBe(money(900));
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect([...document.querySelectorAll(".funnel3d-row-bottom b")].every((node) => node.textContent === "—")).toBe(true);
    expect(document.querySelector(".funnel3d-shape")).toBeNull();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    for (const label of ["Contratos de franquia no período", "Receita de franquia no período", "Contratos de condomínio no período", "Oportunidades abertas"]) expect(value(label)).toBe("—");
    expect(document.querySelectorAll(".funnel3d-row-bottom b").length).toBe(18);
  });
});
