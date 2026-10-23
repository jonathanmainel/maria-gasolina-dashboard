import type { QueryClient } from "@tanstack/react-query";
import { getClientId, isDemoMode } from "./api";
import { supabase } from "./supabase";
import { clearCreativePreviewCache } from "./creative-previews";

export const marketingSources = ["meta_ads", "google_ads", "ga4"] as const;
export type MarketingSource = typeof marketingSources[number];
export interface SourceFreshness { source: MarketingSource; completedAt: string | null; latestDate: string | null }
const refreshKeys = new Set(["fronts", "detail", "site-overview", "site-acquisition", "site-landing-pages", "site-events", "last-sync", "source-freshness"]);

/** Read-only: successful ingestion time and actual persisted date are distinct. */
export async function getSourceFreshness(): Promise<SourceFreshness[]> {
  if (isDemoMode) return marketingSources.map(source => ({ source, completedAt: null, latestDate: null }));
  if (!supabase) throw new Error("Conexão com o Supabase indisponível.");
  const clientId = await getClientId();
  return Promise.all(marketingSources.map(async source => {
    const [sync, coverage] = await Promise.all([
      supabase!.from("dashboard_sync_runs").select("completed_at").eq("client_id", clientId).eq("source", source).eq("status", "success").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase!.from("dashboard_daily_metrics").select("metric_date").eq("client_id", clientId).eq("source", source).order("metric_date", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (sync.error) throw sync.error;
    if (coverage.error) throw coverage.error;
    return { source, completedAt: sync.data?.completed_at ?? null, latestDate: coverage.data?.metric_date ?? null };
  }));
}

/** Refetch marketing reads, including previously visited Site/detail caches. No API collection. */
export async function reloadDashboardData(client: QueryClient) {
  clearCreativePreviewCache();
  await client.invalidateQueries({ predicate: query => refreshKeys.has(String(query.queryKey[0])), refetchType: "all" }, { throwOnError: true });
}
