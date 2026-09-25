// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyTotals, organicSummary } from "../lib/metrics";
import type { DashboardData } from "../lib/use-dashboard";
import { ExecutiveView } from "./Executive";

vi.mock("../lib/goals", () => ({
  useGoals: () => ({ media_budget: 0, leads_franchise: 0, leads_condominium: 0, posts: 0, stories: 0 }),
}));
vi.mock("../components/three/BrazilMap", () => ({ BrazilMap: () => null }));
// Sem Supabase configurado a leitura da base falha: é de propósito, para provar
// que a Visão executiva inteira continua de pé quando só o mapa cai.
vi.mock("../lib/supabase", () => ({ isSupabaseConfigured: false, supabase: null }));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const emptyCrm = { contracts: 0, projected_revenue: 0, revenue: 0, avg_ticket: 0, monthly: [] };
const front = { current: emptyTotals, previous: emptyTotals, rows: [], prevRows: [] };
const data = {
  all: { current: emptyTotals, previous: emptyTotals },
  franchise: front, condominium: front,
  instagram: { current: organicSummary([], "instagram"), previous: organicSummary([], "instagram") },
  facebook: { current: organicSummary([], "facebook"), previous: organicSummary([], "facebook") },
  current: [], organicRows: [], unclassified: { campaigns: [], spend: 0, leads: 0 },
  crm: { franchise: emptyCrm, condominium: emptyCrm },
  delivery: { posts_published: 0, stories_published: 0 },
} as unknown as DashboardData;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const view = () => render(
  <ExecutiveView data={data} range={{ start: "2026-09-01", end: "2026-09-23" }} onNavigate={() => undefined} />,
  { wrapper },
);

describe("Visão Executiva sem GA4", () => {
  it("preserva os blocos executivos e não duplica a seção Site", () => {
    view();
    expect(screen.getByText("O crescimento da rede,")).not.toBeNull();
    expect(screen.getByText("Evolução diária por frente")).not.toBeNull();
    expect(screen.queryByText("Site · Google Analytics 4")).toBeNull();
    expect(screen.queryByText("Aquisição")).toBeNull();
  });

  it("segue de pé quando a base de unidades não carrega", async () => {
    const { container } = view();
    await waitFor(
      () => expect(screen.getByText("Não foi possível carregar a distribuição das unidades.")).not.toBeNull(),
      { timeout: 5000 },
    );
    expect(screen.getByText("Evolução diária por frente")).not.toBeNull();
    expect(screen.getByText("Ritmo do mês contra as metas")).not.toBeNull();
    // Nenhum resquício do mapa fictício aparece no lugar do mapa real.
    const text = container.textContent ?? "";
    expect(text).not.toContain("147");
    expect(text).not.toMatch(/praça/i);
    expect(text).not.toMatch(/leads em negociação/i);
  });
});
