import type { CursorPage, DateRange, EntityItem, EntityLevel, OverviewResponse, PmaxItem, PmaxLevel, Source } from "../types";
import { mockEntities, mockOverview, mockPmax } from "../data/mock";
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
