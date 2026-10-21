import type { CampaignRow, FrontTotals } from "../types";
import type { ChannelFilter } from "./detail-rows";
import { commercialFronts, type PlaceFront } from "./fronts";
import { dailySeries, totals } from "./metrics";
import type { DashboardData } from "./use-dashboard";

export interface PlaceComparisonSnapshot {
  front: PlaceFront;
  status: "available" | "unassociated" | "empty" | "loading" | "error";
  metrics: FrontTotals | null;
  series: Array<{ date: string; leads: number }>;
  campaigns: CampaignRow[];
  origin: "supabase" | "demo" | null;
}

// Adaptador de leitura, sem requisições nem classificação. Somente Condomínios
// tem contrato de dados hoje. Novas fontes entrarão aqui, sem trocar a interface.
export function getPlaceComparisonSnapshot(front: PlaceFront, data: DashboardData | undefined, channel: ChannelFilter): PlaceComparisonSnapshot {
  const empty: PlaceComparisonSnapshot = { front, status: "unassociated", metrics: null, series: [], campaigns: [], origin: null };
  if (commercialFronts[front].dataAvailability === "unavailable") return empty;
  if (!data || data.isLoading) return { ...empty, status: "loading" };
  if (data.isError) return { ...empty, status: "error" };
  if (front !== "condominium") return empty;
  const rows = data.condominium.rows.filter((row) => channel === "all" || row.channel === channel);
  const campaigns = data.campaigns.filter((campaign) => campaign.front === front && (channel === "all" || campaign.channel === channel));
  if (!rows.length) return { ...empty, status: "empty", campaigns, origin: data.paidOrigin };
  return {
    front, status: "available", metrics: totals(rows),
    series: dailySeries(rows).map(({ date, leads }) => ({ date, leads })),
    campaigns, origin: data.paidOrigin,
  };
}

// Ausência de dia não é zero. Só sobrepõe duas séries com a mesma cobertura,
// ao menos dois dias e a mesma origem; nenhuma interpolação ou preenchimento.
export function comparablePlaceSeries(a: PlaceComparisonSnapshot, b: PlaceComparisonSnapshot) {
  if (a.front === b.front || a.status !== "available" || b.status !== "available" || !a.origin || a.origin !== b.origin || a.series.length < 2 || a.series.length !== b.series.length) return [];
  const right = new Map(b.series.map((row) => [row.date, row.leads]));
  if (right.size !== b.series.length || new Set(a.series.map((row) => row.date)).size !== a.series.length || a.series.some((row) => !right.has(row.date))) return [];
  return a.series.map((row) => ({ date: row.date, a: row.leads, b: right.get(row.date)! })).sort((left, right) => left.date.localeCompare(right.date));
}

export function comparisonStatusLabel(snapshot: PlaceComparisonSnapshot): string {
  switch (snapshot.status) {
    case "available": return snapshot.origin === "demo" ? "Demonstração existente da análise individual." : "Dados existentes no período e na plataforma selecionados.";
    case "loading": return "Carregando os dados desta frente.";
    case "error": return "Não foi possível carregar os dados desta frente.";
    case "empty": return "Sem dados no período e na plataforma selecionados.";
    default: return "Dados ainda não disponíveis para esta frente.";
  }
}
