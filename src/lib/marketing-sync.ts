import { CLIENT_SLUG, isDemoMode } from "./api";
import { supabase } from "./supabase";
export const marketingSources = ["google_ads", "meta_ads", "ga4"] as const;
export type MarketingSource = typeof marketingSources[number];
export const sourceLabels: Record<MarketingSource, string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", ga4: "GA4" };
export interface MarketingRun {
  id: string; status: "queued" | "running" | "indeterminate" | "success" | "failed";
  requested_at: string; started_at: string | null; completed_at: string | null;
  range_start: string; range_end: string; database_write_status: string | null;
  error_code: string | null; overdue: boolean; period_mode: "complete_days" | "including_today"; requested_by: string | null; trigger: "cron" | "manual" | "backfill";
}
export interface MarketingSourceStatus {
  source: MarketingSource; enabled: boolean; latest_run: MarketingRun | null;
  last_success_at: string | null; available_through: string | null; missing_accounts: number;
  accounts: Array<{ account_id: string; last_data_date: string | null }>;
  next_manual_at: string | null;
}
export interface MarketingSyncStatus {
  client_id: number; role: string; can_request: boolean; server_time: string; today: string;
  sources: MarketingSourceStatus[]; requested_runs: Array<MarketingRun & { source: MarketingSource }>;
}
export interface MarketingRequestResult {
  ok: boolean; range_start: string; range_end: string;
  results: Array<{ source: MarketingSource; state: "accepted" | "active" | "existing" | "cooldown" | "unavailable"; run_id?: string; retry_at?: string }>;
}
async function invokeSync(body: Record<string, unknown>) {
  if (isDemoMode || !supabase) throw new Error("Sincronização operacional indisponível neste ambiente.");
  const { data, error } = await supabase.functions.invoke("request-dashboard-sync", { body: { ...body, client_slug: CLIENT_SLUG }, signal: AbortSignal.timeout(15000) });
  if (error) throw new Error("Não foi possível acessar a sincronização. Confira seu acesso ou tente novamente mais tarde.");
  return data;
}
export async function getMarketingSyncStatus(runIds: string[] = []): Promise<MarketingSyncStatus> { return invokeSync({ action: "status", ...(runIds.length ? { run_ids: runIds } : {}) }); }
export async function requestMarketingSync(sources: MarketingSource[], requestKey: string): Promise<MarketingRequestResult> {
  return invokeSync({ action: "request", sources, request_key: requestKey });
}
export const activeMarketingRun = (run?: MarketingRun | null) => Boolean(run && ["queued", "running", "indeterminate"].includes(run.status));
export function syncStateLabel(item: MarketingSourceStatus) {
  const run = item.latest_run;
  if (run?.overdue || run?.status === "indeterminate") return "Verificação necessária";
  if (run?.status === "queued") return "Na fila";
  if (run?.status === "running") return "Atualizando...";
  if (run?.status === "failed") return "Falha na sincronização";
  if (run?.status === "success" && run.database_write_status === "no_data") return "Concluída sem novas linhas";
  if (run?.status === "success" && run.database_write_status === "already_processed") return "Dados já processados";
  return run?.status === "success" ? "Sincronização concluída" : "Sem execução registrada";
}
export function isCoverageBehind(item: MarketingSourceStatus, today: string) {
  const yesterday = new Date(`${today}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return item.missing_accounts > 0 || !item.available_through || item.available_through < yesterday.toISOString().slice(0, 10);
}
export function affectedMarketingQueries(source: MarketingSource): string[] {
  return source === "ga4" ? ["site-overview", "site-acquisition", "site-landing-pages", "site-events", "last-sync"] : ["fronts", "detail", "last-sync"];
}
