// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DateRange, OrganicDaily, OrganicPost } from "../types";
import type { DashboardData } from "../lib/use-dashboard";
import { OrganicView, type OrganicScope } from "./Organic";

vi.mock("./Ga4Section", () => ({
  Ga4Section: ({ range }: { range: DateRange }) => (
    <section data-testid="ga4" data-start={range.start} data-end={range.end}>GA4 content</section>
  ),
}));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const row = (platform: "instagram" | "facebook", profile_visits: number): OrganicDaily => ({
  date: "2026-09-23", platform, followers: platform === "instagram" ? 100 : 200,
  new_followers: 5, unfollows: 0, reach: 100, impressions: 200, likes: 10,
  comments: 2, shares: 1, saves: 1, dms: 1, profile_visits, posts: 1, stories: 1,
});
const post = (platform: "instagram" | "facebook"): OrganicPost => ({
  id: platform, platform, format: "image", caption: `Post ${platform}`, published_at: "2026-09-23",
  likes: 10, comments: 2, shares: 1, saves: 1, reach: 100, engagement_rate: 14,
  palette: ["#123456", "#654321"],
});
const range = { start: "2026-09-01", end: "2026-09-23" };
const data = {
  organicRows: [row("instagram", 10), row("facebook", 20)],
  organicPrevRows: [], posts: [post("instagram"), post("facebook")],
  organicOrigin: "demo", delivery: {},
} as unknown as DashboardData;

function TestOrganic({ range: selectedRange = range }: { range?: DateRange }) {
  const [scope, setScope] = useState<OrganicScope>("overview");
  return <OrganicView data={data} range={selectedRange} scope={scope} onScopeChange={setScope} />;
}

describe("Orgânico: visão social e Site", () => {
  it("inicia em Visão Geral e agrega Instagram com Facebook", () => {
    render(<TestOrganic />);
    expect(within(document.querySelector(".organic-scope") as HTMLElement).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Visão Geral", "Instagram", "Facebook", "Site"]);
    expect(screen.getByRole("tab", { name: "Visão Geral" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Post instagram")).not.toBeNull();
    expect(screen.getByText("Post facebook")).not.toBeNull();
    expect(screen.getByText(/Visitas ao perfil no período:/).textContent).toContain("30");
    expect(screen.getByText("Dados de demonstração.")).not.toBeNull();
  });

  it("filtra Instagram e Facebook sem recarregar a página", () => {
    render(<TestOrganic />);
    fireEvent.click(screen.getByRole("tab", { name: "Instagram" }));
    expect(screen.getByText("Post instagram")).not.toBeNull();
    expect(screen.queryByText("Post facebook")).toBeNull();
    expect(screen.getByText(/Visitas ao perfil no período:/).textContent).toContain("10");
    fireEvent.click(screen.getByRole("tab", { name: "Facebook" }));
    expect(screen.queryByText("Post instagram")).toBeNull();
    expect(screen.getByText("Post facebook")).not.toBeNull();
    expect(screen.getByText(/Visitas ao perfil no período:/).textContent).toContain("20");
  });

  it("Site mostra apenas GA4 com o período global, sem KPIs sociais nem aviso demo", () => {
    render(<TestOrganic />);
    fireEvent.click(screen.getByRole("tab", { name: "Site" }));
    const ga4 = screen.getByTestId("ga4");
    expect(ga4.getAttribute("data-start")).toBe(range.start);
    expect(ga4.getAttribute("data-end")).toBe(range.end);
    expect(screen.getByText(/O comportamento dos usuários/)).not.toBeNull();
    expect(screen.queryByText("Seguidores")).toBeNull();
    expect(screen.queryByText("Conteúdos postados no mês")).toBeNull();
    expect(screen.queryByText("Post instagram")).toBeNull();
    expect(screen.queryByText("Dados de demonstração.")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Visão Geral" }));
    expect(screen.queryByTestId("ga4")).toBeNull();
    expect(screen.getByText("Dados de demonstração.")).not.toBeNull();
  });

  it("atualiza o período recebido pelo Site sem seletor próprio", () => {
    const { rerender } = render(<TestOrganic />);
    fireEvent.click(screen.getByRole("tab", { name: "Site" }));
    rerender(<TestOrganic range={{ start: "2026-08-01", end: "2026-08-31" }} />);
    expect(screen.getByRole("tab", { name: "Site" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("ga4").getAttribute("data-start")).toBe("2026-08-01");
    expect(screen.getByTestId("ga4").getAttribute("data-end")).toBe("2026-08-31");
  });
});
