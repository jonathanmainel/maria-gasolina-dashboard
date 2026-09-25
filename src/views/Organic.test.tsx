// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { OrganicDaily, OrganicPost } from "../types";
import type { DashboardData } from "../lib/use-dashboard";
import { OrganicView, type OrganicScope } from "./Organic";

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
const data = {
  organicRows: [row("instagram", 10), row("facebook", 20)],
  organicPrevRows: [], posts: [post("instagram"), post("facebook")],
  organicOrigin: "demo", delivery: {},
} as unknown as DashboardData;

function TestOrganic() {
  const [scope, setScope] = useState<OrganicScope>("overview");
  return <OrganicView data={data} scope={scope} onScopeChange={setScope} />;
}

describe("Orgânico: Instagram e Facebook", () => {
  it("expõe apenas Visão Geral, Instagram e Facebook — o Site saiu para a aba própria", () => {
    render(<TestOrganic />);
    const tabs = within(document.querySelector(".organic-scope") as HTMLElement).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Visão Geral", "Instagram", "Facebook"]);
    expect(screen.queryByRole("tab", { name: "Site" })).toBeNull();
  });

  it("inicia em Visão Geral e agrega Instagram com Facebook", () => {
    render(<TestOrganic />);
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

  it("mantém os blocos sociais em todos os escopos, sem nenhum conteúdo de GA4", () => {
    render(<TestOrganic />);
    for (const scope of ["Instagram", "Facebook", "Visão Geral"]) {
      fireEvent.click(screen.getByRole("tab", { name: scope }));
      expect(screen.getAllByText("Seguidores").length).toBeGreaterThan(0);
      expect(screen.getByText("Conteúdos postados no mês")).not.toBeNull();
      expect(screen.queryByTestId("ga4-acquisition-table")).toBeNull();
      expect(screen.queryByText(/Google Analytics 4/)).toBeNull();
    }
  });
});
