import type { AnalyticsAcquisitionItem, AnalyticsEventItem, CursorPage, DateRange, EntityItem, EntityLevel, OverviewResponse, PmaxItem, PmaxLevel, Source } from "../types";
import { mockAnalyticsAcquisition, mockAnalyticsEvents, mockEntities, mockOverview, mockPmax } from "../data/mock";
import { supabase } from "./supabase";

export const isDemoMode =
  (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "1") &&
  new URLSearchParams(window.location.search).get("demo") === "1";

const delay = (ms = 260) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function getOverview(range: DateRange): Promise<OverviewResponse> {
  if (isDemoMode) {
    await delay();
    return { ...mockOverview, period: { ...mockOverview.period, ...range } };
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_overview", {
    p_client_slug: "maria-gasolina",
    p_start_date: range.start,
    p_end_date: range.end,
  });
  if (error) throw error;
  return data as OverviewResponse;
}

export async function getEntities(source: Source, level: EntityLevel, range: DateRange): Promise<CursorPage<EntityItem>> {
  if (isDemoMode) {
    await delay();
    return mockEntities[`${source === "google_ads" ? "google" : "meta"}_${level}`] ?? { items: [], total_count: 0, next_cursor: null };
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_entities", {
    p_client_slug: "maria-gasolina",
    p_source: source,
    p_level: level,
    p_start_date: range.start,
    p_end_date: range.end,
    p_limit: 50,
    p_cursor: null,
  });
  if (error) throw error;
  return data as CursorPage<EntityItem>;
}

export async function getPmax(level: PmaxLevel, range: DateRange): Promise<CursorPage<PmaxItem>> {
  if (isDemoMode) {
    await delay();
    return mockPmax[level];
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_pmax", {
    p_client_slug: "maria-gasolina",
    p_start_date: range.start,
    p_end_date: range.end,
    p_level: level,
    p_limit: 50,
    p_cursor: null,
  });
  if (error) throw error;
  return data as CursorPage<PmaxItem>;
}

function mockPage<T>(items: T[], cursor: Record<string, string | number> | null, limit: number): CursorPage<T> {
  const offset = Number(cursor?.offset ?? 0);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return { items: page, total_count: items.length, next_cursor: nextOffset < items.length ? { offset: nextOffset } : null };
}

export async function getAnalyticsAcquisition(
  range: DateRange,
  cursor: Record<string, string | number> | null = null,
  limit = 10,
): Promise<CursorPage<AnalyticsAcquisitionItem>> {
  if (isDemoMode) {
    await delay();
    return mockPage(mockAnalyticsAcquisition, cursor, limit);
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_ga4_acquisition", {
    p_client_slug: "maria-gasolina",
    p_start_date: range.start,
    p_end_date: range.end,
    p_limit: limit,
    p_cursor: cursor,
  });
  if (error) throw error;
  return data as CursorPage<AnalyticsAcquisitionItem>;
}

export async function getAnalyticsEvents(
  range: DateRange,
  cursor: Record<string, string | number> | null = null,
  limit = 10,
): Promise<CursorPage<AnalyticsEventItem>> {
  if (isDemoMode) {
    await delay();
    return mockPage(mockAnalyticsEvents, cursor, limit);
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_ga4_events", {
    p_client_slug: "maria-gasolina",
    p_start_date: range.start,
    p_end_date: range.end,
    p_limit: limit,
    p_cursor: cursor,
  });
  if (error) throw error;
  return data as CursorPage<AnalyticsEventItem>;
}


// ---------------------------------------------------------------------------
// v2 — frentes, orgânico e CRM. Em produção cada função chama uma RPC do
// Supabase; enquanto as integrações (Meta Graph API, CRM Elo) não existem,
// tudo cai no gerador de demonstração.
// ---------------------------------------------------------------------------
import { demoCampaigns, demoCreatives, demoCrm, demoDelivery, demoFrontDaily, demoOrganicDaily, demoOrganicPosts, demoWhatsappFlow } from "../data/demo";
import type { CampaignRow, Creative, CrmSummary, DeliveryStatus, Front, FrontDaily, OrganicDaily, OrganicPost } from "../types";

export interface FrontBundle {
  daily: FrontDaily[];
  campaigns: CampaignRow[];
  creatives: Creative[];
}

export async function getFrontData(range: DateRange): Promise<FrontBundle> {
  if (isDemoMode || !supabase) {
    await delay(180);
    const daily = demoFrontDaily;
    const inPeriod = daily.filter((r) => r.date >= range.start && r.date <= range.end);
    return { daily, campaigns: demoCampaigns(inPeriod), creatives: demoCreatives(inPeriod) };
  }
  const { data, error } = await supabase.rpc("get_dashboard_fronts", { p_client_slug: "maria-gasolina", p_start_date: range.start, p_end_date: range.end });
  if (error) throw error;
  return data as FrontBundle;
}

export interface OrganicBundle { daily: OrganicDaily[]; posts: OrganicPost[] }

export async function getOrganic(range: DateRange): Promise<OrganicBundle> {
  if (isDemoMode || !supabase) {
    await delay(200);
    return { daily: demoOrganicDaily, posts: demoOrganicPosts.filter((p) => p.published_at >= range.start && p.published_at <= range.end) };
  }
  const { data, error } = await supabase.rpc("get_dashboard_organic", { p_client_slug: "maria-gasolina", p_start_date: range.start, p_end_date: range.end });
  if (error) throw error;
  return data as OrganicBundle;
}

export async function getCrm(front: Front, leads: number): Promise<CrmSummary> {
  await delay(120);
  return demoCrm(front, leads);
}

export async function getDelivery(): Promise<DeliveryStatus & { whatsapp: typeof demoWhatsappFlow }> {
  await delay(80);
  return { ...demoDelivery, whatsapp: demoWhatsappFlow };
}
