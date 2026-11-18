import { fetchAllRows, getClientId } from "./api";
import { reportingToday, shiftReportingDay } from "./reporting-period";
import { supabase } from "./supabase";
import type { Channel } from "../types";

const platforms = ["meta_ads", "google_ads"] as const;
const windowDays = 7;

export interface SpendDay {
  source: Channel;
  account_id: string;
  metric_date: string;
  spend: number | null;
  extra_metrics: { currency_code?: string } | null;
  ingested_at: string;
}

export function spendWindow(today: string) {
  return { start: shiftReportingDay(today, -windowDays), end: shiftReportingDay(today, -1) };
}

export async function loadRetaguardaSpend() {
  if (!supabase) throw new Error("Conexão de mídia indisponível.");
  const db = supabase;
  const today = reportingToday();
  const id = await getClientId();
  const { start, end } = spendWindow(today);
  const [days, ...runs] = await Promise.all([
    fetchAllRows<SpendDay>("dashboard_daily_metrics", "source,account_id,metric_date,spend,extra_metrics,ingested_at",
      query => query.eq("client_id", id).in("source", [...platforms])
        .gte("metric_date", start).lte("metric_date", end).order("id")),
    ...platforms.map(source => db.from("dashboard_automation_runs").select("status")
      .eq("client_id", id).eq("source", source).eq("operation", "metrics")
      .order("requested_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle()),
  ]);
  const sync = new Map(platforms.map((source, index) => {
    const run = runs[index];
    return [source, run.error ? "unavailable" : run.data?.status ?? null] as const;
  }));
  return { days, sync, today };
}

export function summarizeAccountSpend(rows: SpendDay[], source: Channel, accountId: string, today: string) {
  const { start, end } = spendWindow(today);
  const byDate = new Map<string, SpendDay | null>();
  for (const row of rows) {
    if (row.source !== source || row.account_id !== accountId || row.metric_date < start || row.metric_date > end) continue;
    const previous = byDate.get(row.metric_date);
    if (previous === null) continue;
    if (previous && (previous.spend !== row.spend || previous.extra_metrics?.currency_code !== row.extra_metrics?.currency_code)) {
      byDate.set(row.metric_date, null);
    } else if (!previous || Date.parse(row.ingested_at) > Date.parse(previous.ingested_at)) {
      byDate.set(row.metric_date, row);
    }
  }

  let micros = 0;
  let validDays = 0;
  let unverifiedCurrency = false;
  let lastCollection: string | null = null;
  for (const row of byDate.values()) {
    if (!row) continue;
    const collectedAt = Date.parse(row.ingested_at);
    if (!Number.isFinite(collectedAt)) continue;
    if (!lastCollection || collectedAt > Date.parse(lastCollection)) {
      lastCollection = row.ingested_at;
    }
    if (reportingToday(new Date(collectedAt)) <= row.metric_date) continue;
    if (row.spend === null || !Number.isFinite(row.spend) || row.spend < 0) continue;
    if (row.extra_metrics?.currency_code !== "BRL") {
      unverifiedCurrency = true;
      continue;
    }
    micros += Math.round(row.spend * 1_000_000);
    validDays++;
  }
  const estimate = validDays === windowDays && Number.isSafeInteger(micros) ? micros / (windowDays * 1_000_000) : null;
  return { start, end, estimate, validDays, unverifiedCurrency, lastCollection };
}

export function estimateAutonomy(balance: number | null | undefined, spend: number | null, fresh: boolean) {
  if (!fresh || balance == null || !Number.isFinite(balance) || balance < 0 || spend === null || !Number.isFinite(spend) || spend <= 0) return null;
  return balance / spend;
}

export function hasRecentBalance(reference: string, measuredAt: string | null, today: string) {
  if (!measuredAt || !Number.isFinite(Date.parse(measuredAt))) return false;
  const lastCompleteDay = spendWindow(today).end;
  const measured = reportingToday(new Date(measuredAt));
  return reference >= lastCompleteDay && reference <= today && measured >= lastCompleteDay && measured <= today;
}

export function consolidateSpend(estimates: Array<number | null>) {
  if (estimates.length === 0 || estimates.some(estimate => estimate === null)) return null;
  return estimates.reduce<number>((total, estimate) => total + (estimate ?? 0), 0);
}
