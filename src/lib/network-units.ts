import { useQuery } from "@tanstack/react-query";
import { demoNetworkUnits } from "../data/demo";
import { CLIENT_SLUG, isDemoMode } from "./api";
import { projectLatLng } from "./map-projection";
import { supabase } from "./supabase";
import type {
  NetworkCity, NetworkMapCity, NetworkUnitsSnapshot, NetworkUnitsSummary,
} from "../types";

// ---------------------------------------------------------------------------
// Base de unidades da rede
//
// Leitura: RPC `get_dashboard_network_units(p_client_slug)`, que devolve um
// único jsonb com `units`, `cities` (já agrupadas e com coordenada resolvida),
// `summary` e `headquarters`. A RPC é `security invoker` e só concede execute a
// `authenticated`, então a sessão atual do Supabase é a única autenticação
// envolvida — não há token manipulado aqui.
//
// Escrita: nunca por esta via. A substituição do snapshot passa pela Edge
// Function `import-network-units` (ver `network-import.ts`).
// ---------------------------------------------------------------------------

export const networkUnitsKey = ["network-units", CLIENT_SLUG] as const;

export const emptyNetworkSummary: NetworkUnitsSummary = {
  total_units: 0,
  total_cities: 0,
  unresolved_cities: 0,
  last_import_at: null,
  last_import: null,
};

export const emptyNetworkSnapshot: NetworkUnitsSnapshot = {
  units: [],
  cities: [],
  summary: emptyNetworkSummary,
  headquarters: { city: "Campinas", state: "SP" },
};

/** Normaliza o jsonb da RPC contra o formato esperado, sem inventar valores. */
export function normalizeSnapshot(raw: unknown): NetworkUnitsSnapshot {
  const source = (raw ?? {}) as Partial<NetworkUnitsSnapshot>;
  const summary = (source.summary ?? {}) as Partial<NetworkUnitsSummary>;
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return {
    units: Array.isArray(source.units) ? source.units : [],
    cities: Array.isArray(source.cities) ? source.cities : [],
    summary: {
      total_units: count(summary.total_units),
      total_cities: count(summary.total_cities),
      unresolved_cities: count(summary.unresolved_cities),
      last_import_at: summary.last_import_at ?? null,
      last_import: summary.last_import ?? null,
    },
    headquarters: source.headquarters ?? emptyNetworkSnapshot.headquarters,
  };
}

export async function getNetworkUnits(): Promise<NetworkUnitsSnapshot> {
  if (isDemoMode) return demoNetworkUnits;
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_network_units", {
    p_client_slug: CLIENT_SLUG,
  });
  if (error) throw error;
  return normalizeSnapshot(data);
}

/** "38 unidades", "1 unidade" — a regra de singular usada no mapa e na leitura acessível. */
export function unitCountLabel(count: number): string {
  return `${count} ${count === 1 ? "unidade" : "unidades"}`;
}

/** UFs distintas com operação, derivadas das cidades recebidas. */
export function networkStateCount(cities: NetworkCity[]): number {
  return new Set(cities.map((city) => city.state)).size;
}

const isHeadquarters = (city: NetworkCity, hq: { city: string; state: string }) =>
  city.state.toUpperCase() === hq.state.toUpperCase()
  && city.normalized_city === normalizeCityName(hq.city);

/** Mesma normalização da Edge Function: sem acento, minúscula, espaços colapsados. */
export function normalizeCityName(value: string): string {
  return value
    .trim()
    .replace(/\s+/gu, " ")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/**
 * Converte o snapshot nas cidades desenháveis do mapa: um marcador por cidade,
 * com a coordenada já projetada e a sede sinalizada no próprio ponto.
 *
 * Cidades `unresolved` ficam fora — sem latitude/longitude não há onde
 * desenhá-las. Elas continuam contando no resumo, e o painel de importação
 * avisa quando existem.
 */
export function toMapCities(snapshot: NetworkUnitsSnapshot): NetworkMapCity[] {
  return snapshot.cities
    .filter((city) => city.resolved && city.latitude != null && city.longitude != null)
    .map((city) => {
      const { x, y } = projectLatLng(city.latitude!, city.longitude!);
      return {
        key: `${city.state}-${city.normalized_city}`,
        city: city.city,
        state: city.state,
        unitCount: city.unit_count,
        x,
        y,
        isHeadquarters: isHeadquarters(city, snapshot.headquarters),
      };
    });
}

export function useNetworkUnits() {
  return useQuery({
    queryKey: networkUnitsKey,
    queryFn: getNetworkUnits,
    // A base muda só quando alguém sobe uma planilha nova, e a importação
    // invalida esta chave explicitamente. Não faz sentido refazer a leitura a
    // cada montagem da Visão executiva.
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
