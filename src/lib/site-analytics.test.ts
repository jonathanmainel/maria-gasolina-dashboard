import { describe, expect, it } from "vitest";
import {
  INSIGHT_MIN_SESSIONS, INSIGHT_MIN_SESSION_SHARE, LEAD_EVENT, buildInsights, channelPerformance,
  eventHighlights, isRateEligible, siteDailySeries, siteMonthlySeries, siteSeries, siteWeeklySeries,
  topLandingPages,
} from "./site-analytics";
import type { AnalyticsAcquisitionItem, AnalyticsDailyMetric, AnalyticsEventItem, AnalyticsKpis, AnalyticsLandingPageItem } from "../types";

const day = (date: string, sessions: number, engaged: number, leads: number): AnalyticsDailyMetric => ({
  date, sessions, engaged_sessions: engaged, active_users: sessions, new_users: Math.round(sessions * 0.8),
  views: sessions * 2, events: sessions * 5, conversions: leads, revenue: 0,
  page_views: sessions * 2, scrolls: sessions, generate_leads: leads,
});

// 14 dias em dois meses, para exercitar diário, semanal e mensal com o mesmo dado.
const daily: AnalyticsDailyMetric[] = [
  day("2026-08-25", 100, 50, 5), day("2026-08-26", 100, 50, 5), day("2026-08-27", 100, 50, 5),
  day("2026-08-28", 100, 50, 5), day("2026-08-29", 100, 50, 5), day("2026-08-30", 100, 50, 5),
  day("2026-08-31", 100, 20, 1),
  day("2026-09-01", 200, 100, 10), day("2026-09-02", 200, 100, 10), day("2026-09-03", 200, 100, 10),
  day("2026-09-04", 200, 100, 10), day("2026-09-05", 200, 100, 10), day("2026-09-06", 200, 100, 10),
  day("2026-09-07", 200, 40, 2),
];

describe("séries do gráfico Tráfego e geração de leads", () => {
  it("diário devolve um ponto por dia, na ordem da data", () => {
    const series = siteDailySeries(daily);
    expect(series).toHaveLength(14);
    expect(series[0].key).toBe("2026-08-25");
    expect(series[0].label).toBe("25/08");
    expect(series.at(-1)!.key).toBe("2026-09-07");
    expect(series[0].sessions).toBe(100);
    expect(series[0].generate_leads).toBe(5);
  });

  it("diário soma dias repetidos em vez de desenhar dois pontos no mesmo rótulo", () => {
    const series = siteDailySeries([day("2026-09-01", 10, 5, 1), day("2026-09-01", 30, 10, 2)]);
    expect(series).toHaveLength(1);
    expect(series[0].sessions).toBe(40);
    expect(series[0].generate_leads).toBe(3);
    expect(series[0].engagement_rate).toBeCloseTo(37.5);
  });

  it("semanal soma blocos de 7 dias contados do início do período", () => {
    const weeks = siteWeeklySeries(daily);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].label).toBe("25/08");
    expect(weeks[0].sessions).toBe(700);
    expect(weeks[0].engaged_sessions).toBe(320);
    expect(weeks[0].generate_leads).toBe(31);
    expect(weeks[1].sessions).toBe(1400);
  });

  it("mensal agrupa por mês de calendário", () => {
    const months = siteMonthlySeries(daily);
    expect(months.map((m) => m.key)).toEqual(["2026-08", "2026-09"]);
    expect(months.map((m) => m.label)).toEqual(["ago/26", "set/26"]);
    expect(months[0].sessions).toBe(700);
    expect(months[1].sessions).toBe(1400);
    expect(months[1].generate_leads).toBe(62);
  });

  it("taxa de engajamento é soma/soma, nunca média das taxas diárias", () => {
    // Médias diárias da semana 1: (6 × 50% + 1 × 20%) / 7 ≈ 45,7%.
    // O correto é 320 engajadas / 700 sessões ≈ 45,71% — aqui coincide de perto,
    // então o teste usa um caso em que média e soma/soma divergem de verdade.
    const skewed = [day("2026-09-01", 10, 10, 0), day("2026-09-02", 990, 99, 0)];
    const weeks = siteWeeklySeries(skewed);
    expect(weeks[0].engagement_rate).toBeCloseTo((109 * 100) / 1000);
    const averageOfRates = (100 + 10) / 2;
    expect(weeks[0].engagement_rate).not.toBeCloseTo(averageOfRates);
  });

  it("taxa de conversão é soma/soma, nunca média das taxas diárias", () => {
    const skewed = [day("2026-09-01", 10, 5, 5), day("2026-09-02", 990, 500, 5)];
    const months = siteMonthlySeries(skewed);
    expect(months[0].lead_rate).toBeCloseTo((10 * 100) / 1000);
    const averageOfRates = (50 + 0.5050505) / 2;
    expect(months[0].lead_rate).not.toBeCloseTo(averageOfRates);
  });

  it("um período sem dias devolve série vazia em qualquer modo", () => {
    expect(siteSeries([], "daily")).toEqual([]);
    expect(siteSeries([], "weekly")).toEqual([]);
    expect(siteSeries([], "monthly")).toEqual([]);
  });

  it("siteSeries encaminha para a agregação do modo escolhido", () => {
    expect(siteSeries(daily, "daily")).toHaveLength(14);
    expect(siteSeries(daily, "weekly")).toHaveLength(2);
    expect(siteSeries(daily, "monthly")).toHaveLength(2);
  });
});

const acquisition = (channel: string, source: string, sessions: number, engaged: number, leads: number): AnalyticsAcquisitionItem => ({
  channel_group: channel, source_medium: source, sessions, engaged_sessions: engaged,
  new_users: Math.round(sessions * 0.8), views: sessions * 2, events: sessions * 5,
  key_events: leads, generate_leads: leads,
  engagement_rate: sessions ? (engaged * 100) / sessions : null,
  lead_rate: sessions ? (leads * 100) / sessions : null,
});

const channelRows: AnalyticsAcquisitionItem[] = [
  acquisition("Cross-network", "google / cross-network", 1200, 500, 20),
  acquisition("Cross-network", "facebook / cpc", 1018, 500, 10),
  acquisition("Paid Search", "google / cpc", 1155, 600, 40),
  acquisition("Organic Search", "google / organic", 762, 500, 6),
  acquisition("Referral", "parceiro / referral", 8, 8, 4),
];

describe("performance por canal", () => {
  it("colapsa origem/mídia em um registro por canal, ordenado por sessões", () => {
    const channels = channelPerformance(channelRows);
    expect(channels.map((c) => c.channel)).toEqual(["Cross-network", "Paid Search", "Organic Search", "Referral"]);
    expect(channels[0].sessions).toBe(2218);
    expect(channels[0].generate_leads).toBe(30);
  });

  it("recalcula as taxas a partir dos totais do canal", () => {
    const [crossNetwork] = channelPerformance(channelRows);
    expect(crossNetwork.engagement_rate).toBeCloseTo((1000 * 100) / 2218);
    expect(crossNetwork.lead_rate).toBeCloseTo((30 * 100) / 2218);
  });

  it("calcula a fatia de sessões e de leads do período", () => {
    const channels = channelPerformance(channelRows);
    const total = 2218 + 1155 + 762 + 8;
    expect(channels[0].session_share).toBeCloseTo((2218 * 100) / total);
    expect(channels[1].lead_share).toBeCloseTo((40 * 100) / 80);
  });

  it("não quebra com lista vazia", () => {
    expect(channelPerformance([])).toEqual([]);
  });
});

describe("regra mínima de volume dos rankings por taxa", () => {
  it("aceita canal com pelo menos a fatia mínima de sessões", () => {
    const channels = channelPerformance(channelRows);
    const paidSearch = channels.find((c) => c.channel === "Paid Search")!;
    expect(paidSearch.session_share!).toBeGreaterThanOrEqual(INSIGHT_MIN_SESSION_SHARE);
    expect(isRateEligible(paidSearch)).toBe(true);
  });

  it("descarta canal minúsculo mesmo com taxa altíssima", () => {
    const channels = channelPerformance(channelRows);
    const referral = channels.find((c) => c.channel === "Referral")!;
    expect(referral.lead_rate).toBe(50);
    expect(referral.sessions).toBeLessThan(INSIGHT_MIN_SESSIONS);
    expect(isRateEligible(referral)).toBe(false);
  });

  it("aceita canal de fatia pequena que tem volume absoluto suficiente", () => {
    const many = Array.from({ length: 40 }, (_, i) => acquisition(`Canal ${i}`, "x / y", 100, 50, 1));
    const small = channelPerformance([...many, acquisition("Nicho", "x / y", INSIGHT_MIN_SESSIONS, 20, 3)])
      .find((c) => c.channel === "Nicho")!;
    expect(small.session_share!).toBeLessThan(INSIGHT_MIN_SESSION_SHARE);
    expect(small.sessions).toBeGreaterThanOrEqual(INSIGHT_MIN_SESSIONS);
    expect(isRateEligible(small)).toBe(true);
  });
});

const landingPages: AnalyticsLandingPageItem[] = [
  { landing_page: "/seja-um-franqueado", sessions: 3581, engaged_sessions: 1800, active_users: 3000, new_users: 2800, views: 5000, events: 9000, key_events: 40, primary_conversions: null, engagement_rate: (1800 * 100) / 3581, conversion_rate: null },
  { landing_page: "/", sessions: 1468, engaged_sessions: 700, active_users: 1200, new_users: 1100, views: 2000, events: 4000, key_events: 10, primary_conversions: null, engagement_rate: (700 * 100) / 1468, conversion_rate: null },
  { landing_page: "/links", sessions: 298, engaged_sessions: 100, active_users: 260, new_users: 240, views: 400, events: 900, key_events: 2, primary_conversions: null, engagement_rate: (100 * 100) / 298, conversion_rate: null },
  { landing_page: "/contato", sessions: 120, engaged_sessions: 60, active_users: 110, new_users: 90, views: 200, events: 400, key_events: 1, primary_conversions: null, engagement_rate: 50, conversion_rate: null },
  { landing_page: "/sobre", sessions: 90, engaged_sessions: 30, active_users: 80, new_users: 70, views: 150, events: 300, key_events: 0, primary_conversions: null, engagement_rate: 33.3, conversion_rate: null },
  { landing_page: "/blog", sessions: 45, engaged_sessions: 20, active_users: 40, new_users: 35, views: 80, events: 160, key_events: 0, primary_conversions: null, engagement_rate: 44.4, conversion_rate: null },
];

describe("top landing pages", () => {
  it("devolve as 5 maiores por sessões, com a fatia do período", () => {
    const top = topLandingPages(landingPages);
    expect(top).toHaveLength(5);
    expect(top.map((p) => p.landing_page)).toEqual(["/seja-um-franqueado", "/", "/links", "/contato", "/sobre"]);
    const total = landingPages.reduce((sum, p) => sum + p.sessions, 0);
    expect(top[0].session_share).toBeCloseTo((3581 * 100) / total);
  });

  it("não inventa conversão por landing page quando o backend devolve null", () => {
    for (const page of topLandingPages(landingPages)) {
      expect(page.primary_conversions).toBeNull();
      expect(page.conversion_rate).toBeNull();
    }
  });
});

const event = (event_name: string, event_count: number, key_events = 0): AnalyticsEventItem => ({
  event_name, event_count, key_events, daily_average: event_count / 30, share_of_total: event_count / 100,
});

describe("eventos do site", () => {
  const events = [event("page_view", 7934), event("scroll", 3000), event("click", 1200), event(LEAD_EVENT, 128, 128), event("form_start", 400), event("video_start", 0)];

  it("trata form_submit como Lead, sem expor o nome técnico no destaque", () => {
    const highlights = eventHighlights(events);
    expect(highlights[0].event_name).toBe(LEAD_EVENT);
    expect(highlights[0].label).toBe("Leads");
    expect(highlights[0].isLead).toBe(true);
    expect(highlights[0].count).toBe(128);
    expect(highlights.filter((h) => h.isLead)).toHaveLength(1);
  });

  it("destaca no máximo 4 eventos, só os que existem nos dados", () => {
    const highlights = eventHighlights(events);
    expect(highlights).toHaveLength(4);
    expect(highlights.map((h) => h.event_name)).toEqual([LEAD_EVENT, "form_start", "click", "scroll"]);
    expect(highlights.some((h) => h.event_name === "video_start")).toBe(false);
  });

  it("não fabrica destaque quando não há eventos", () => {
    expect(eventHighlights([])).toEqual([]);
  });
});

const kpis = (over: Partial<AnalyticsKpis> = {}): AnalyticsKpis => ({
  has_data: true, sessions: 4143, engaged_sessions: 2100, active_users: 3500, new_users: 3300,
  views: 7934, events: 32148, conversions: 80, revenue: 0, generate_leads: 80,
  engagement_rate: (2100 * 100) / 4143, views_per_session: 1.9, lead_rate: (80 * 100) / 4143,
  ...over,
});

describe("insights do período", () => {
  const input = { current: kpis(), previous: kpis({ sessions: 3600, generate_leads: 66 }), channels: channelPerformance(channelRows), landingPages };

  it("gera no máximo 4 insights", () => {
    expect(buildInsights(input).length).toBeLessThanOrEqual(4);
    expect(buildInsights(input).length).toBeGreaterThanOrEqual(3);
  });

  it("abre com a variação de sessões e de leads contra o período anterior", () => {
    const insights = buildInsights(input);
    expect(insights[0].id).toBe("sessions-trend");
    expect(insights[0].kind).toBe("Crescimento");
    expect(insights[0].text).toMatch(/Sessões cresceram 15% em relação ao período anterior\./);
    expect(insights[1].id).toBe("leads-trend");
    expect(insights[1].text).toMatch(/Os leads cresceram 21%/);
  });

  it("marca queda como Atenção e tom negativo", () => {
    const [first] = buildInsights({ ...input, previous: kpis({ sessions: 6000, generate_leads: 80 }) });
    expect(first.kind).toBe("Atenção");
    expect(first.tone).toBe("negative");
    expect(first.text).toMatch(/Sessões caíram 31%/);
  });

  it("aponta o canal que concentrou as sessões e o que trouxe os leads", () => {
    const insights = buildInsights(input, 8);
    const sessionsInsight = insights.find((i) => i.id === "top-channel-sessions")!;
    const leadsInsight = insights.find((i) => i.id === "top-channel-leads")!;
    expect(sessionsInsight.text).toMatch(/^Cross-network concentrou \d+% das sessões do período\.$/);
    expect(leadsInsight.text).toMatch(/^Paid Search respondeu por 50% dos leads do site\.$/);
  });

  it("aponta a landing page de entrada com a fatia real de sessões", () => {
    const insight = buildInsights(input, 8).find((i) => i.id === "top-landing-page")!;
    expect(insight.kind).toBe("Entrada");
    expect(insight.text).toMatch(/^\/seja-um-franqueado recebeu 64% das sessões do site\.$/);
  });

  it("nunca elege um canal irrelevante como melhor taxa de conversão", () => {
    const insight = buildInsights(input, 8).find((i) => i.id === "best-conversion")!;
    expect(insight.text).not.toContain("Referral");
    expect(insight.text).toContain("Paid Search");
  });

  it("não repete o mesmo canal em sessões e em leads: cede a vaga para um insight de taxa", () => {
    const dominant = channelPerformance([
      acquisition("Cross-network", "google / cross-network", 2000, 900, 50),
      acquisition("Paid Search", "google / cpc", 500, 300, 10),
    ]);
    const insights = buildInsights({ ...input, channels: dominant }, 8);
    expect(insights.find((i) => i.id === "top-channel-sessions")!.text).toContain("Cross-network");
    expect(insights.find((i) => i.id === "top-channel-leads")).toBeUndefined();
    expect(insights.find((i) => i.id === "best-conversion")).toBeDefined();
  });

  it("sem período de comparação ainda entrega insights de composição", () => {
    const insights = buildInsights({ ...input, previous: null });
    expect(insights).toHaveLength(4);
    expect(insights.map((i) => i.id)).toEqual(["top-channel-sessions", "top-channel-leads", "best-conversion", "top-landing-page"]);
  });

  it("devolve lista vazia quando o período não tem dados", () => {
    expect(buildInsights({ ...input, current: null })).toEqual([]);
    expect(buildInsights({ ...input, current: kpis({ has_data: false }) })).toEqual([]);
  });

  it("sobrevive a aquisição e landing pages vazias", () => {
    const insights = buildInsights({ ...input, channels: [], landingPages: [] });
    expect(insights.map((i) => i.id)).toEqual(["sessions-trend", "leads-trend"]);
  });
});
