import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getFrontData, getOrganic } from "./api";
import { buildCrmSummary } from "./crm";
import { useManualData } from "./manual-inputs";
import { byFront, inRange, organicSummary, previousRange, totals } from "./metrics";
import { useTheme } from "../theme";
import type { DateRange, Front, FrontDaily, OrganicDaily } from "../types";

export function useDashboard(range: DateRange) {
  // A chave inclui o intervalo inteiro: trocar o período descarta o cache antigo
  // em vez de reaproveitá-lo, então nenhum card fica exibindo o período anterior
  // enquanto o novo carrega. Todas as telas leem deste mesmo hook, o que garante
  // que card, gráfico e tabela estejam sempre no mesmo intervalo.
  const fronts = useQuery({ queryKey: ["fronts", range.start, range.end], queryFn: () => getFrontData(range), refetchInterval: 5 * 60 * 1000 });
  const organic = useQuery({ queryKey: ["organic", range.start, range.end], queryFn: () => getOrganic(range) });
  const manual = useManualData();
  const prev = useMemo(() => previousRange(range), [range]);

  const computed = useMemo(() => {
    const daily: FrontDaily[] = fronts.data?.daily ?? [];
    const cur = inRange(daily, range);
    const before = inRange(daily, prev);
    const org: OrganicDaily[] = organic.data?.daily ?? [];
    const orgCur = org.filter((r) => r.date >= range.start && r.date <= range.end);
    const orgPrev = org.filter((r) => r.date >= prev.start && r.date <= prev.end);
    const front = (f: Front) => ({ current: totals(byFront(cur, f)), previous: totals(byFront(before, f)), rows: byFront(cur, f), prevRows: byFront(before, f) });
    const crm = (f: Front) => buildCrmSummary(f, manual.data.funnel[f], manual.data.results[f], { rows: byFront(cur, f) });
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
      // Snapshot do kanban + resultado do período, ambos manuais; leads mensais reais de mídia.
      crm: { franchise: crm("franchise"), condominium: crm("condominium") },
      delivery: manual.data.delivery,
      goals: manual.data.goals,
      manualStorage: manual.storage,
    };
  }, [fronts.data, organic.data, manual.data, manual.storage, range, prev]);

  return {
    ...computed,
    prevRange: prev,
    isLoading: fronts.isLoading || organic.isLoading || manual.isLoading,
    isError: fronts.isError || organic.isError,
    error: (fronts.error ?? organic.error) as Error | null,
    refetch: () => { void fronts.refetch(); void organic.refetch(); },
  };
}

export type DashboardData = ReturnType<typeof useDashboard>;

export function useChartColors() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    red: dark ? "#d8443a" : "#b3301f",
    gold: dark ? "#e9ad3f" : "#c88a19",
    violet: dark ? "#9b7bff" : "#6a4de0",
    sky: dark ? "#5ab4ff" : "#1f7fd6",
    green: dark ? "#3ccd8f" : "#1f9e6a",
    meta: dark ? "#5ab4ff" : "#1f7fd6",
    google: dark ? "#6fd39a" : "#1f9e6a",
    instagram: dark ? "#ff7ab8" : "#d62976",
    facebook: dark ? "#7db9ff" : "#1877f2",
    grid: dark ? "rgba(255,255,255,.06)" : "#e6ebef",
    tick: "#7d8b98",
    text: dark ? "#eef2f5" : "#17222b",
  };
}

export const frontMeta: Record<Front, { label: string; short: string; accent: "red" | "gold"; color: string; description: string; leadWord: string }> = {
  franchise: { label: "Expansão de franquias", short: "Franquias", accent: "red", color: "var(--red)", description: "Tráfego pago para captar candidatos a franqueado", leadWord: "candidatos" },
  condominium: { label: "Captação de condomínios", short: "Condomínios", accent: "gold", color: "var(--gold)", description: "Tráfego pago para captar indicações de síndicos e condomínios", leadWord: "indicações" },
};
