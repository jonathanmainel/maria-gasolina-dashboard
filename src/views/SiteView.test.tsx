// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { cloneElement, isValidElement, type ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllItems } from "../lib/api";
import type { AnalyticsAcquisitionItem, AnalyticsDailyMetric, AnalyticsEventItem, AnalyticsKpis, AnalyticsLandingPageItem, DateRange } from "../types";

const getSiteOverview = vi.fn();
const getAllAnalyticsAcquisition = vi.fn();
const getAllAnalyticsLandingPages = vi.fn();
const getAllAnalyticsEvents = vi.fn();

vi.mock("../lib/api", () => ({
  getSiteOverview: (...args: unknown[]) => getSiteOverview(...args),
  getAllAnalyticsAcquisition: (...args: unknown[]) => getAllAnalyticsAcquisition(...args),
  getAllAnalyticsLandingPages: (...args: unknown[]) => getAllAnalyticsLandingPages(...args),
  getAllAnalyticsEvents: (...args: unknown[]) => getAllAnalyticsEvents(...args),
}));

// Recharts mede o contêiner; no jsdom ele tem largura zero e nada é desenhado.
// O gráfico é verificado pelo contrato do componente (modo, série e legenda),
// não pelos pixels — daí o mock do ResponsiveContainer com tamanho fixo.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      <div>{isValidElement(children) ? cloneElement(children, { width: 800, height: 320 } as never) : children}</div>,
  };
});

const { SiteView } = await import("./SiteView");

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const range: DateRange = { start: "2026-08-25", end: "2026-09-07" };

const day = (date: string, sessions: number, engaged: number, leads: number): AnalyticsDailyMetric => ({
  date, sessions, engaged_sessions: engaged, active_users: sessions, new_users: Math.round(sessions * 0.8),
  views: sessions * 2, events: sessions * 5, conversions: leads, revenue: 0,
  page_views: sessions * 2, scrolls: sessions, generate_leads: leads,
});

const daily: AnalyticsDailyMetric[] = [
  day("2026-08-25", 100, 50, 5), day("2026-08-26", 100, 50, 5), day("2026-08-27", 100, 50, 5),
  day("2026-08-28", 100, 50, 5), day("2026-08-29", 100, 50, 5), day("2026-08-30", 100, 50, 5),
  day("2026-08-31", 100, 50, 5),
  day("2026-09-01", 200, 100, 10), day("2026-09-02", 200, 100, 10), day("2026-09-03", 200, 100, 10),
  day("2026-09-04", 200, 100, 10), day("2026-09-05", 200, 100, 10), day("2026-09-06", 200, 100, 10),
  day("2026-09-07", 200, 100, 10),
];

const current: AnalyticsKpis = {
  has_data: true, sessions: 2100, engaged_sessions: 1050, active_users: 1800, new_users: 1680,
  views: 4200, events: 10500, conversions: 105, revenue: 0, generate_leads: 105,
  engagement_rate: 50, views_per_session: 2, lead_rate: 5,
};
const previous: AnalyticsKpis = { ...current, sessions: 1800, new_users: 1400, engaged_sessions: 810, generate_leads: 84, engagement_rate: 45, lead_rate: 4.67 };

const acquisitionItems: AnalyticsAcquisitionItem[] = [
  { channel_group: "Cross-network", source_medium: "google / cross-network", sessions: 1200, engaged_sessions: 576, new_users: 960, views: 2400, events: 6000, key_events: 30, generate_leads: 30, engagement_rate: 48, lead_rate: 2.5 },
  { channel_group: "Paid Search", source_medium: "google / cpc", sessions: 600, engaged_sessions: 330, new_users: 480, views: 1200, events: 3000, key_events: 60, generate_leads: 60, engagement_rate: 55, lead_rate: 10 },
  { channel_group: "Organic Search", source_medium: "google / organic", sessions: 300, engaged_sessions: 144, new_users: 240, views: 600, events: 1500, key_events: 15, generate_leads: 15, engagement_rate: 48, lead_rate: 5 },
];

const landingItems: AnalyticsLandingPageItem[] = [
  { landing_page: "/seja-um-franqueado", sessions: 1400, engaged_sessions: 700, active_users: 1200, new_users: 1100, views: 2800, events: 7000, key_events: 80, primary_conversions: null, engagement_rate: 50, conversion_rate: null },
  { landing_page: "/", sessions: 500, engaged_sessions: 200, active_users: 450, new_users: 400, views: 1000, events: 2500, key_events: 20, primary_conversions: null, engagement_rate: 40, conversion_rate: null },
  { landing_page: "/links", sessions: 200, engaged_sessions: 60, active_users: 180, new_users: 160, views: 400, events: 1000, key_events: 5, primary_conversions: null, engagement_rate: 30, conversion_rate: null },
];

const eventItems: AnalyticsEventItem[] = [
  { event_name: "page_view", event_count: 4200, key_events: 0, daily_average: 300, share_of_total: 40 },
  { event_name: "scroll", event_count: 2100, key_events: 0, daily_average: 150, share_of_total: 20 },
  { event_name: "form_submit", event_count: 105, key_events: 105, daily_average: 7.5, share_of_total: 1 },
  { event_name: "form_start", event_count: 320, key_events: 0, daily_average: 22.8, share_of_total: 3 },
];

const page = <T,>(items: T[]): AllItems<T> => ({ items, truncated: false });

/** Texto renderizado em toda a pagina: as mensagens de erro misturam no de texto
 *  com interpolacao, entao casar por no isolado seria fragil. */
const pageText = () => document.body.textContent ?? "";
const kpiLabels = () => [...document.querySelectorAll(".grid-6 .kpi .kpi-top p")].map((el) => el.textContent);
const bars = () => document.querySelectorAll('[data-testid="site-traffic-chart"] .recharts-bar-rectangle').length;

function renderSite(selected: DateRange = range) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SiteView range={selected} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSiteOverview.mockResolvedValue({ current, previous, daily, origin: "supabase" });
  getAllAnalyticsAcquisition.mockResolvedValue(page(acquisitionItems));
  getAllAnalyticsLandingPages.mockResolvedValue(page(landingItems));
  getAllAnalyticsEvents.mockResolvedValue(page(eventItems));
});
afterEach(cleanup);

describe("aba Site: cabeçalho e KPIs executivos", () => {
  it("mostra o header do GA4 no padrão das outras páginas", async () => {
    renderSite();
    expect(screen.getByText(/Site · Google Analytics 4/)).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("O comportamento dos usuários");
    expect(screen.getByText(/Tráfego, engajamento, aquisição e geração de leads/)).not.toBeNull();
    await waitFor(() => expect(kpiLabels()).toHaveLength(6));
  });

  it("tem exatamente os 6 KPIs pedidos, nessa ordem", async () => {
    renderSite();
    await waitFor(() => expect(kpiLabels()).toHaveLength(6));
    expect(kpiLabels()).toEqual(["Sessões", "Novos usuários", "Sessões engajadas", "Taxa de engajamento", "Leads", "Taxa de conversão"]);
  });

  it("exibe generate_leads como Leads e lead_rate como Taxa de conversão", async () => {
    renderSite();
    await waitFor(() => expect(kpiLabels()).toHaveLength(6));
    const kpis = [...document.querySelectorAll(".grid-6 .kpi")] as HTMLElement[];
    const leads = kpis.find((kpi) => kpi.querySelector(".kpi-top p")?.textContent === "Leads")!;
    const rate = kpis.find((kpi) => kpi.querySelector(".kpi-top p")?.textContent === "Taxa de conversão")!;
    await waitFor(() => expect(leads.querySelector(".kpi-value strong")!.textContent).toBe("105"));
    await waitFor(() => expect(rate.querySelector(".kpi-value strong")!.textContent).toBe("5%"));
    // Nada de "generate_leads" nem "lead_rate" cru na interface.
    expect(pageText()).not.toContain("generate_leads");
    expect(pageText()).not.toContain("lead_rate");
  });

  it("não sobe eventos, key events, receita nem usuários agregados para os KPIs do topo", async () => {
    renderSite();
    await waitFor(() => expect(kpiLabels()).toHaveLength(6));
    expect(kpiLabels()).not.toContain("Eventos");
    expect(kpiLabels()).not.toContain("Usuários");
    expect(kpiLabels()).not.toContain("Receita");
    expect(kpiLabels()).not.toContain("Conversões (key events)");
  });

  it("compara cada KPI com o período anterior", async () => {
    renderSite();
    await waitFor(() => expect(kpiLabels()).toHaveLength(6));
    const sessions = [...document.querySelectorAll(".grid-6 .kpi")].find((kpi) => kpi.querySelector(".kpi-top p")?.textContent === "Sessões")!;
    expect(sessions.querySelector(".delta.up")).not.toBeNull();
    expect(sessions.querySelector(".delta")!.textContent).toContain("16,7%");
  });

  it("respeita o período global em todas as consultas, sem date picker próprio", async () => {
    renderSite();
    await waitFor(() => expect(getSiteOverview).toHaveBeenCalledWith(range));
    expect(getAllAnalyticsAcquisition).toHaveBeenCalledWith(range);
    expect(getAllAnalyticsLandingPages).toHaveBeenCalledWith(range);
    expect(getAllAnalyticsEvents).toHaveBeenCalledWith(range);
    expect(document.querySelector(".period-button")).toBeNull();

    cleanup();
    const other: DateRange = { start: "2026-07-01", end: "2026-07-31" };
    renderSite(other);
    await waitFor(() => expect(getSiteOverview).toHaveBeenCalledWith(other));
    expect(getAllAnalyticsLandingPages).toHaveBeenCalledWith(other);
  });
});

describe("aba Site: gráfico Tráfego e geração de leads", () => {
  it("nasce em Diário com um ponto por dia e mostra sessões e leads", async () => {
    renderSite();
    await waitFor(() => expect(screen.getByTestId("site-traffic-chart")).not.toBeNull());
    expect(screen.getByRole("tab", { name: "Diário" }).getAttribute("aria-selected")).toBe("true");
    const legend = document.querySelector(".panel .legend")!;
    expect(legend.textContent).toContain("Sessões");
    expect(legend.textContent).toContain("Leads");
    await waitFor(() => expect(bars()).toBe(14));
  });

  it("agrupa em semanas e em meses pelo seletor", async () => {
    renderSite();
    await waitFor(() => expect(screen.getByTestId("site-traffic-chart")).not.toBeNull());

    await waitFor(() => expect(bars()).toBe(14));
    fireEvent.click(screen.getByRole("tab", { name: "Semanal" }));
    await waitFor(() => expect(bars()).toBe(2));
    expect(screen.getByText(/Barras são sessões/).textContent).toContain("por semana");

    fireEvent.click(screen.getByRole("tab", { name: "Mensal" }));
    await waitFor(() => expect(pageText()).toContain("por mês"));
    expect(screen.getByText(/Barras são sessões/).textContent).toContain("por mês");
    expect(screen.getAllByText("ago/26").length).toBeGreaterThan(0);
    expect(screen.getAllByText("set/26").length).toBeGreaterThan(0);
  });

  it("troca a linha de Leads para Taxa de engajamento sem perder as barras de sessões", async () => {
    renderSite();
    await waitFor(() => expect(screen.getByTestId("site-traffic-chart")).not.toBeNull());
    fireEvent.click(screen.getByRole("tab", { name: "Engajamento" }));
    await waitFor(() => expect(document.querySelector(".panel .legend")!.textContent).toContain("Taxa de engajamento"));
    expect(document.querySelector(".panel .legend")!.textContent).toContain("Sessões");
    await waitFor(() => expect(bars()).toBe(14));
  });
});

describe("aba Site: canais, insights, aquisição, landing pages e eventos", () => {
  it("mostra performance por canal com dados reais, em barras e não em tabela", async () => {
    renderSite();
    const panel = await waitFor(() => screen.getByTestId("site-channel-performance"));
    const rows = [...panel.querySelectorAll(".channel-row")];
    expect(rows.map((row) => row.querySelector("strong")!.textContent)).toEqual(["Cross-network", "Paid Search", "Organic Search"]);
    expect(rows[0].textContent).toContain("1.200");
    expect(rows[0].textContent).toContain("48% engajamento");
    expect(rows[1].textContent).toContain("60 leads");
    expect(rows[1].textContent).toContain("10% conversão");
    expect(panel.querySelector("table")).toBeNull();
    expect(rows[0].querySelector(".channel-track span")).not.toBeNull();
  });

  it("gera insights determinísticos do período", async () => {
    renderSite();
    const insights = await waitFor(() => screen.getByTestId("site-insights"));
    const cards = [...insights.querySelectorAll(".insight")];
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(4);
    expect(insights.textContent).toContain("Sessões cresceram 17%");
    expect(insights.textContent).toContain("Cross-network concentrou");
  });

  it("monta a tabela de aquisição com Leads e Taxa de conversão, ordenada por sessões", async () => {
    renderSite();
    const table = await waitFor(() => screen.getByTestId("ga4-acquisition-table"));
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Canal", "Origem / mídia", "Sessões", "Sessões engajadas", "Taxa de engajamento", "Novos usuários", "Leads", "Taxa de conversão"]);
    const firstRow = table.querySelector("tbody tr")!;
    expect(firstRow.textContent).toContain("Cross-network");
  });

  it("permite reordenar a aquisição por leads", async () => {
    renderSite();
    await waitFor(() => screen.getByTestId("ga4-acquisition-table"));
    fireEvent.click(screen.getByRole("tab", { name: "Por leads" }));
    await waitFor(() => {
      const firstRow = screen.getByTestId("ga4-acquisition-table").querySelector("tbody tr")!;
      expect(firstRow.textContent).toContain("Paid Search");
    });
  });

  it("mostra Top landing pages em barras e a tabela sem coluna de conversões", async () => {
    renderSite();
    const top = await waitFor(() => screen.getByTestId("site-top-landing-pages"));
    const bars = [...top.querySelectorAll(".channel-row")];
    expect(bars).toHaveLength(3);
    expect(bars[0].textContent).toContain("/seja-um-franqueado");
    expect(bars[0].textContent).toContain("50% engajamento");
    expect(bars[0].querySelector(".channel-track span")).not.toBeNull();

    const table = screen.getByTestId("ga4-landing-pages-table");
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
    expect(headers).toEqual(["Página", "Sessões", "Sessões engajadas", "Taxa de engajamento", "Novos usuários", "Visualizações"]);
    expect(headers).not.toContain("Conversões");
    expect(headers).not.toContain("Taxa de conversão");
  });

  it("trata form_submit como Lead nos destaques e mantém o nome técnico só na tabela", async () => {
    renderSite();
    const highlights = await waitFor(() => screen.getByTestId("site-event-highlights"));
    const cards = [...highlights.querySelectorAll(".event-highlight")];
    expect(cards[0].querySelector("small")!.textContent).toBe("Leads");
    expect(cards[0].querySelector("strong")!.textContent).toBe("105");
    expect(highlights.textContent).not.toContain("form_submit");
    expect(within(screen.getByTestId("ga4-events-table")).getAllByText("form_submit").length).toBeGreaterThan(0);
  });

  it("não exibe nenhum aviso de tracking, proxy ou conversão provisória", async () => {
    renderSite();
    await waitFor(() => screen.getByTestId("site-event-highlights"));
    const text = document.body.textContent ?? "";
    for (const forbidden of ["proxy", "provisóri", "em validação", "não validado", "inconsistente", "tracking"]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("não monta funil de sessões → form_start → form_submit nesta tela", async () => {
    renderSite();
    await waitFor(() => screen.getByTestId("site-event-highlights"));
    expect(document.querySelector(".funnel3d")).toBeNull();
  });
});

describe("aba Site: carregamento, vazio e erro parcial", () => {
  it("mostra skeletons enquanto as consultas não respondem, sem quebrar o layout", () => {
    getSiteOverview.mockReturnValue(new Promise(() => {}));
    getAllAnalyticsAcquisition.mockReturnValue(new Promise(() => {}));
    getAllAnalyticsLandingPages.mockReturnValue(new Promise(() => {}));
    getAllAnalyticsEvents.mockReturnValue(new Promise(() => {}));
    renderSite();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("Tráfego e geração de leads")).not.toBeNull();
    expect(screen.getByText("Performance por canal")).not.toBeNull();
  });

  it("mostra estado vazio quando o período não tem dados do site", async () => {
    getSiteOverview.mockResolvedValue({ current: { ...current, has_data: false }, previous: null, daily: [], origin: "supabase" });
    getAllAnalyticsAcquisition.mockResolvedValue(page([]));
    getAllAnalyticsLandingPages.mockResolvedValue(page([]));
    getAllAnalyticsEvents.mockResolvedValue(page([]));
    renderSite();
    await waitFor(() => expect(screen.getByText("Nenhum dado do site sincronizado para este período.")).not.toBeNull());
    expect(screen.getByText("Nenhum canal com sessões neste período.")).not.toBeNull();
    expect(screen.getByText("Nenhuma landing page encontrada neste período.")).not.toBeNull();
    expect(screen.getByText("Nenhum evento encontrado neste período.")).not.toBeNull();
  });

  it("erro nas landing pages não derruba KPIs, gráfico, canais nem eventos", async () => {
    getAllAnalyticsLandingPages.mockRejectedValue(new Error("RPC fora do ar"));
    renderSite();
    await waitFor(() => expect(pageText()).toContain("Não foi possível carregar as landing pages"), { timeout: 5000 });
    expect(pageText()).toContain("RPC fora do ar");
    expect(screen.getByTestId("site-traffic-chart")).not.toBeNull();
    expect(screen.getByTestId("site-channel-performance")).not.toBeNull();
    expect(screen.getByTestId("ga4-acquisition-table")).not.toBeNull();
    expect(screen.getByTestId("ga4-events-table")).not.toBeNull();
    const labels = [...document.querySelectorAll(".grid-6 .kpi .kpi-top p")].map((el) => el.textContent);
    expect(labels).toContain("Leads");
  });

  it("erro no overview não derruba aquisição, landing pages nem eventos", async () => {
    getSiteOverview.mockRejectedValue(new Error("overview indisponível"));
    renderSite();
    await waitFor(() => expect(pageText()).toContain("Não foi possível carregar os dados do site"), { timeout: 5000 });
    expect(screen.getByTestId("ga4-acquisition-table")).not.toBeNull();
    expect(screen.getByTestId("site-top-landing-pages")).not.toBeNull();
    expect(screen.getByTestId("ga4-events-table")).not.toBeNull();
  });
});

describe("aba Site: paginação das tabelas", () => {
  it("percorre todas as páginas da RPC antes de montar rankings e tabelas", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      ...acquisitionItems[0], channel_group: `Canal ${String(i).padStart(2, "0")}`,
      source_medium: `origem-${i} / medium`, sessions: 1000 - i, generate_leads: 60 - i,
    }));
    getAllAnalyticsAcquisition.mockResolvedValue(page(many));
    renderSite();
    const table = await waitFor(() => screen.getByTestId("ga4-acquisition-table"));
    expect(table.querySelector(".table-count")!.textContent).toBe("Exibindo 25 de 60");

    fireEvent.click(within(table).getByRole("button", { name: /Carregar mais/ }));
    await waitFor(() => expect(table.querySelector(".table-count")!.textContent).toBe("Exibindo 50 de 60"));
    fireEvent.click(within(table).getByRole("button", { name: /Carregar mais/ }));
    await waitFor(() => expect(table.querySelector(".table-count")!.textContent).toBe("Exibindo 60 de 60"));
    expect(within(table).queryByRole("button", { name: /Carregar mais/ })).toBeNull();
  });

  it("avisa quando a leitura atinge o teto de segurança em vez de cortar em silêncio", async () => {
    getAllAnalyticsEvents.mockResolvedValue({ items: eventItems, truncated: true });
    renderSite();
    await waitFor(() => expect(pageText()).toContain("A leitura dos eventos atingiu o limite de segurança"));
  });
});
