import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { demoDelivery, demoGoals } from "../data/demo";
import { CLIENT_SLUG, isDemoMode } from "./api";
import { supabase } from "./supabase";
import type { Front, ManualBusinessData, ManualFunnelInput, ManualStorage } from "../types";

// ---------------------------------------------------------------------------
// Onde os dados de negócio manuais ficam guardados
//
// O CRM Elo ainda não expõe API de leitura, então os valores-base do funil
// comercial e as publicações do Instagram no mês são digitados no próprio
// dashboard. Persistência:
//
//   1. `public.dashboard_manual_inputs` no Supabase (uma linha por cliente e
//      escopo, payload em jsonb) — ver a migration de mesmo nome. É a fonte
//      compartilhada entre os usuários do cliente.
//   2. `localStorage` como fallback: usado no modo demonstração, quando o
//      Supabase não está configurado e quando a tabela ainda não foi aplicada
//      no projeto. Nesse caso a interface avisa que o valor é só deste
//      navegador, em vez de fingir que salvou para todo mundo.
//
// O formato é um bloco jsonb único e não um esquema normalizado de propósito:
// quando o CRM real entrar, basta parar de ler este escopo e trocar a origem
// em `buildCrmSummary` — nada de pipeline de ingestão precisa mudar.
// ---------------------------------------------------------------------------

export const MANUAL_SCOPE = "business";
const LOCAL_KEY = "mg-dashboard-manual-v1";
/** Códigos do PostgREST/Postgres para "tabela não existe". */
const MISSING_TABLE = new Set(["PGRST205", "PGRST202", "42P01"]);

export const defaultFunnel: Record<Front, ManualFunnelInput> = {
  franchise: { stages: [420, 260, 130, 67, 36, 18], stage_days: [3, 6, 9, 12, 17], avg_ticket: 84500 },
  condominium: { stages: [180, 126, 79, 49, 27, 16], stage_days: [5, 9, 12, 16, 20], avg_ticket: 0 },
};

export const defaultManualData: ManualBusinessData = {
  goals: demoGoals,
  funnel: defaultFunnel,
  delivery: demoDelivery,
};

export interface ManualDataResult {
  data: ManualBusinessData;
  storage: ManualStorage;
  /** Motivo de ter caído no armazenamento local, quando houver. */
  fallbackReason?: string;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Normaliza o payload vindo do banco/localStorage contra os padrões, campo a campo. */
function normalize(raw: unknown): ManualBusinessData {
  const source = (raw ?? {}) as Partial<ManualBusinessData>;
  // Copia apenas as chaves conhecidas do padrão, descartando NaN, negativos e
  // campos estranhos vindos de um payload antigo ou corrompido.
  const numbers = <T extends object>(fallback: T, value: unknown): T => {
    const partial = (value ?? {}) as Record<string, unknown>;
    const out = { ...fallback } as Record<string, unknown>;
    Object.keys(fallback as Record<string, unknown>).forEach((key) => {
      const candidate = partial[key];
      if (isFiniteNumber(candidate)) out[key] = Math.max(0, candidate);
    });
    return out as T;
  };
  const funnel = (front: Front): ManualFunnelInput => {
    const fallback = defaultFunnel[front];
    const partial = (source.funnel?.[front] ?? {}) as Partial<ManualFunnelInput>;
    const list = (value: unknown, size: number, base: number[]) =>
      Array.isArray(value) && value.length === size && value.every(isFiniteNumber)
        ? (value as number[]).map((n) => Math.max(0, n))
        : base;
    return {
      stages: list(partial.stages, fallback.stages.length, fallback.stages),
      stage_days: list(partial.stage_days, fallback.stage_days.length, fallback.stage_days),
      avg_ticket: isFiniteNumber(partial.avg_ticket) ? Math.max(0, partial.avg_ticket) : fallback.avg_ticket,
    };
  };
  return {
    goals: numbers(defaultManualData.goals, source.goals),
    funnel: { franchise: funnel("franchise"), condominium: funnel("condominium") },
    // Só as chaves do padrão sobrevivem: campos de módulos removidos (entregas
    // do contrato, régua de WhatsApp) em payloads antigos são descartados aqui.
    delivery: numbers(defaultManualData.delivery, source.delivery),
  };
}

function readLocal(): ManualBusinessData {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* storage indisponível ou payload corrompido: cai no padrão */ }
  return defaultManualData;
}

function writeLocal(data: ManualBusinessData) {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch { /* ignora quota/modo privado */ }
}

async function clientId(): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("dashboard_clients").select("id").eq("slug", CLIENT_SLUG).maybeSingle();
  if (error || !data) return null;
  return data.id as number;
}

export async function loadManualData(): Promise<ManualDataResult> {
  if (isDemoMode || !supabase) {
    return { data: readLocal(), storage: "local", fallbackReason: isDemoMode ? "Modo demonstração" : "Supabase não configurado" };
  }
  const id = await clientId();
  if (id == null) return { data: readLocal(), storage: "local", fallbackReason: "Cliente não encontrado no Supabase" };

  const { data, error } = await supabase
    .from("dashboard_manual_inputs")
    .select("payload")
    .eq("client_id", id)
    .eq("scope", MANUAL_SCOPE)
    .maybeSingle();

  if (error) {
    if (MISSING_TABLE.has(error.code)) {
      return { data: readLocal(), storage: "local", fallbackReason: "Tabela dashboard_manual_inputs ainda não aplicada" };
    }
    throw error;
  }
  return { data: normalize(data?.payload), storage: "supabase" };
}

export async function saveManualData(next: ManualBusinessData): Promise<ManualDataResult> {
  const payload = normalize(next);

  if (isDemoMode || !supabase) {
    writeLocal(payload);
    return { data: payload, storage: "local", fallbackReason: isDemoMode ? "Modo demonstração" : "Supabase não configurado" };
  }

  const id = await clientId();
  if (id == null) {
    writeLocal(payload);
    return { data: payload, storage: "local", fallbackReason: "Cliente não encontrado no Supabase" };
  }

  const { error } = await supabase
    .from("dashboard_manual_inputs")
    .upsert({ client_id: id, scope: MANUAL_SCOPE, payload, updated_at: new Date().toISOString() }, { onConflict: "client_id,scope" });

  if (error) {
    if (MISSING_TABLE.has(error.code)) {
      writeLocal(payload);
      return { data: payload, storage: "local", fallbackReason: "Tabela dashboard_manual_inputs ainda não aplicada" };
    }
    throw error;
  }
  writeLocal(payload); // espelho local: mantém o valor visível se a rede cair no próximo carregamento
  return { data: payload, storage: "supabase" };
}

export const manualDataKey = ["manual-business-data"] as const;

export function useManualData() {
  const query = useQuery({ queryKey: manualDataKey, queryFn: loadManualData, staleTime: 60_000, retry: 1 });
  return {
    data: query.data?.data ?? defaultManualData,
    storage: query.data?.storage ?? "local",
    fallbackReason: query.data?.fallbackReason,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
  };
}

/** Mutação única de salvamento: garante que um clique repetido não dispare duas requisições. */
export function useSaveManualData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveManualData,
    onSuccess: (result) => {
      queryClient.setQueryData(manualDataKey, result);
      void queryClient.invalidateQueries({ queryKey: ["crm"] });
    },
  });
}
