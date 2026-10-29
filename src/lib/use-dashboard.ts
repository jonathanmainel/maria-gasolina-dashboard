import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getFrontData, getOrganic } from "./api";
import { buildCrmSummary } from "./crm";
import { useCommercialData } from "./commercial-data";
import { commercialFronts } from "./fronts";
import { isDemoMode } from "./api";
import { useManualData } from "./manual-inputs";
import { byFront, inRange, organicSummary, previousRange, totals } from "./metrics";
import { useTheme } from "../theme";
import type { DateRange, Front, CommercialFront, CrmSummary, FrontDaily, OrganicDaily } from "../types";

export function useDashboard(range: DateRange) {
  // A chave inclui o intervalo inteiro: trocar o período descarta o cache antigo
  // em vez de reaproveitá-lo, então nenhum card fica exibindo o período anterior
  // enquanto o novo carrega. Todas as telas leem deste mesmo hook, o que garante
  // que card, gráfico e tabela estejam sempre no mesmo intervalo.
  const fronts = useQuery({ queryKey: ["fronts", range.start, range.end], queryFn: () => getFrontData(range), refetchInterval: 5 * 60 * 1000 });
  const organic = useQuery({ queryKey: ["organic", range.start, range.end], queryFn: () => getOrganic(range) });
  const manual = useManualData();
  const commercial = useCommercialData(range);
  const prev = useMemo(() => previousRange(range), [range]);

  const computed = useMemo(() => {
    const daily: FrontDaily[] = fronts.data?.daily ?? [];
    const cur = inRange(daily, range);
    const before = inRange(daily, prev);
    const org: OrganicDaily[] = organic.data?.daily ?? [];
    const orgCur = org.filter((r) => r.date >= range.start && r.date <= range.end);
    const orgPrev = org.filter((r) => r.date >= prev.start && r.date <= prev.end);
    const front = (f: Front) => ({ current: totals(byFront(cur, f)), previous: totals(byFront(before, f)), rows: byFront(cur, f), prevRows: byFront(before, f) });
    const crm = Object.fromEntries(Object.values(commercialFronts).map(({ id }) => {
      const entry = commercial.entries[id];
      const rows = id === "franchise" || id === "condominium" ? byFront(cur, id) : [];
      const origin = isDemoMode ? "example" as const : "manual" as const;
      return [id, { ...buildCrmSummary(id, entry.snapshot, entry.result, { rows }), snapshot_origin: entry.snapshot ? origin : "unavailable", results_origin: entry.result ? origin : "unavailable", snapshot_updated_at: entry.snapshotUpdatedAt, results_updated_at: entry.resultUpdatedAt, results_period: entry.result ? range : null }];
    })) as Record<CommercialFront, CrmSummary>;
    return {
      current: cur,
      previous: before,
      all: { current: totals(cur), previous: totals(before) },
      franchise: front("franchise"),
      condominium: front("condominium"),
      campaigns: fronts.data?.campaigns ?? [],
      creatives: fronts.data?.creatives ?? [],
      unclassified: fronts.data?.unclassified ?? { campaigns: [], spend: 0, leads: 0 },
      paidOrigin: fronts.data?.origin ?? "demo",
      organicRows: orgCur,
      organicPrevRows: orgPrev,
      organicOrigin: organic.data?.origin ?? "demo",
      instagram: { current: organicSummary(orgCur, "instagram"), previous: organicSummary(orgPrev, "instagram") },
      facebook: { current: organicSummary(orgCur, "facebook"), previous: organicSummary(orgPrev, "facebook") },
      posts: organic.data?.posts ?? [],
      // Registros comerciais isolados por frente e período; mídia permanece independente.
      crm,
      commercial,
      delivery: manual.data.delivery,
      goals: manual.data.goals,
      manualStorage: manual.storage,
    };
  }, [fronts.data, organic.data, manual.data, manual.storage, commercial.entries, commercial.access, commercial.isLoading, commercial.isError, range, prev]);

  return {
    ...computed,
    prevRange: prev,
    isLoading: fronts.isLoading || organic.isLoading || manual.isLoading,
    isError: fronts.isError || organic.isError,
    error: (fronts.error ?? organic.error) as Error | null,
    // View state follows its own existing read query, without changing fetches,
    // permissions, cache keys or synchronization schedules.
    sourceStates: {
      settings: { isLoading: manual.isLoading, isError: manual.isError, error: manual.error, refetch: manual.refetch },
      organic: { isLoading: organic.isLoading, isError: organic.isError, error: organic.error, refetch: organic.refetch },
    },
    refetch: () => { void fronts.refetch(); void organic.refetch(); },
  };
}

export type DashboardData = ReturnType<typeof useDashboard>;

export function useChartColors() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    red: dark ? "#d8443a" : "#b3301f",
    gold: dark ? "#e9ad3f" : "#b57912",
    violet: dark ? "#9b7bff" : "#6a4de0",
    sky: dark ? "#5ab4ff" : "#1f7fd6",
    green: dark ? "#3ccd8f" : "#1f9e6a",
    meta: dark ? "#5ab4ff" : "#1f7fd6",
    google: dark ? "#6fd39a" : "#1f9e6a",
    instagram: dark ? "#ff7ab8" : "#d62976",
    facebook: dark ? "#7db9ff" : "#1877f2",
    grid: dark ? "rgba(255,255,255,.06)" : "#e6ebef",
    tick: "var(--chart-tick)",
    text: dark ? "#eef2f5" : "#17222b",
  };
}

export { frontMeta } from "./fronts";
