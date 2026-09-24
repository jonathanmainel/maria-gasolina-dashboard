// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyTotals, organicSummary } from "../lib/metrics";
import type { DashboardData } from "../lib/use-dashboard";
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

describe("Visão Executiva sem GA4", () => {
  it("preserva os blocos executivos e não duplica a seção Site", () => {
    render(<ExecutiveView data={data} range={{ start: "2026-09-01", end: "2026-09-23" }} onNavigate={() => undefined} />);
    expect(screen.getByText("O crescimento da rede,")).not.toBeNull();
    expect(screen.getByText("Evolução diária por frente")).not.toBeNull();
    expect(screen.queryByText("Site · Google Analytics 4")).toBeNull();
    expect(screen.queryByText("Aquisição")).toBeNull();
  });
});
