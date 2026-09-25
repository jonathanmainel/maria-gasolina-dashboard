// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildCrmSummary } from "../lib/crm";
import { emptyTotals, organicSummary } from "../lib/metrics";
import type { DashboardData } from "../lib/use-dashboard";
import type { Front } from "../types";
import { ExecutiveView } from "./Executive";

vi.mock("../lib/goals", () => ({
  useGoals: () => ({ media_budget: 0, leads_franchise: 0, leads_condominium: 0, posts: 0, stories: 0 }),
}));
vi.mock("../components/three/BrazilMap", () => ({ BrazilMap: () => null }));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

// Resumo real e vazio, em vez de um objeto parcial: assim a fixture acompanha
// o contrato de CrmSummary sozinha quando ele muda.
const emptyCrm = (front: Front) =>
  buildCrmSummary(front, { stages: {}, stage_days: {}, avg_ticket: 0 }, { contracts_closed: 0, revenue: 0 }, { rows: [] });
const front = { current: emptyTotals, previous: emptyTotals, rows: [], prevRows: [] };
const data = {
  all: { current: emptyTotals, previous: emptyTotals },
  franchise: front, condominium: front,
  instagram: { current: organicSummary([], "instagram"), previous: organicSummary([], "instagram") },
  facebook: { current: organicSummary([], "facebook"), previous: organicSummary([], "facebook") },
  current: [], organicRows: [], unclassified: { campaigns: [], spend: 0, leads: 0 },
  crm: { franchise: emptyCrm("franchise"), condominium: emptyCrm("condominium") },
  delivery: { posts_published: 0, stories_published: 0 },
} as unknown as DashboardData;

describe("Visão Executiva sem GA4", () => {
  it("preserva os blocos executivos e não duplica a seção Site", () => {
    render(<ExecutiveView data={data} range={{ start: "2026-09-01", end: "2026-09-23" }} onNavigate={() => undefined} />);
    expect(screen.getByText("O crescimento da rede,")).not.toBeNull();
    expect(screen.getByText("Evolução diária por frente")).not.toBeNull();
    expect(screen.queryByText("Site · Google Analytics 4")).toBeNull();
    expect(screen.queryByText("Aquisição")).toBeNull();
  });
});
