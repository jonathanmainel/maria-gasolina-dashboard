import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { demoDelivery, demoGoals } from "../data/demo";
import { CLIENT_SLUG, isDemoMode } from "./api";
import { defaultFunnel, defaultResults, normalizeFunnel, normalizeResults } from "./manual-funnel";
import { supabase } from "./supabase";
import { loadCommercialAccess } from "./commercial-access";
import { assertManualWriteConfirmed } from "./manual-write";
import type { Front, ManualBusinessData, ManualStorage } from "../types";

// Configuracoes manuais (metas e conteudos) continuam no Supabase/localStorage.
// Dados comerciais legados foram desativados na operacao: seus valores nunca
// sao normalizados, exibidos ou gravados novamente. O futuro provedor Elo pode
// alimentar os contratos de CRM existentes sem depender deste armazenamento.
// Exemplos comerciais e seu editor usam exclusivamente o modo demo explicito,
// em chave local separada. A chave antiga permanece intacta e recuperavel.

export const MANUAL_SCOPE = "business";
const LEGACY_LOCAL_KEY = "mg-dashboard-manual-v1";
const LOCAL_KEY = `mg-dashboard-settings-v2:${CLIENT_SLUG}`;
const DEMO_LOCAL_KEY = `mg-dashboard-demo-v1:${CLIENT_SLUG}`;
/** Códigos do PostgREST/Postgres para "tabela não existe". */
const MISSING_TABLE = new Set(["PGRST205", "PGRST202", "42P01"]);

// Padrões e migração do funil moram em `manual-funnel.ts`, junto do mapa de
// etapas legadas; re-exportado aqui porque as telas leem o padrão por este módulo.
export { defaultFunnel, defaultResults } from "./manual-funnel";

export const defaultManualData: ManualBusinessData = {
  goals: demoGoals,
  funnel: { franchise: null, condominium: null },
  results: { franchise: null, condominium: null },
  delivery: demoDelivery,
};

// Os exemplos comerciais existem somente no modo demonstrativo explicito.
export const demoManualData: ManualBusinessData = {
  ...defaultManualData, funnel: defaultFunnel, results: defaultResults,
};

export interface ManualDataResult {
  data: ManualBusinessData;
  storage: ManualStorage;
  /** Motivo de ter caído no armazenamento local, quando houver. */
  fallbackReason?: string;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Normaliza o payload vindo do banco/localStorage contra os padrões, campo a campo. Exportada para teste. */
export function normalize(raw: unknown, demo = isDemoMode): ManualBusinessData {
  const source = (raw ?? {}) as Partial<ManualBusinessData>;
  // Configuracoes: copia apenas as chaves conhecidas do padrão, descartando NaN, negativos e
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
  // Conversao do legado comercial apenas para exemplos explicitamente demo.
  const funnel = (front: Front) => demo && source.funnel?.[front] !== null ? normalizeFunnel(front, source.funnel?.[front]) : null;
  // O resultado do período recebe o funil bruto junto porque, num payload do
  // modelo antigo, o total de contratos assinados morava na última posição do
  // array de etapas — é o único caminho de migração; fora dele, nada é inferido.
  const results = (front: Front) => demo && source.results?.[front] !== null ? normalizeResults(front, source.results?.[front], source.funnel?.[front]) : null;
  return {
    goals: numbers(defaultManualData.goals, source.goals),
    funnel: { franchise: funnel("franchise"), condominium: funnel("condominium") },
    results: { franchise: results("franchise"), condominium: results("condominium") },
    // Só as chaves do padrão sobrevivem: campos de módulos removidos (entregas
    // do contrato, régua de WhatsApp) em payloads antigos são descartados aqui.
    delivery: numbers(defaultManualData.delivery, source.delivery),
  };
}

// A chave legada nao e removida: permanece recuperavel. Na operacao, somente
// metas/entregas sao aproveitadas; campos comerciais nunca entram na normalizacao.
function readLocal(): ManualBusinessData {
  for (const key of isDemoMode ? [DEMO_LOCAL_KEY] : [LOCAL_KEY, LEGACY_LOCAL_KEY]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return normalize(JSON.parse(raw));
    } catch { /* tenta a proxima fonte de configuracoes, sem alterar o original */ }
  }
  return isDemoMode ? demoManualData : defaultManualData;
}

function storagePayload(data: ManualBusinessData) {
  return isDemoMode ? data : { goals: data.goals, delivery: data.delivery };
}

function writeLocal(data: ManualBusinessData) {
  try { window.localStorage.setItem(isDemoMode ? DEMO_LOCAL_KEY : LOCAL_KEY, JSON.stringify(storagePayload(data))); } catch { /* quota/modo privado */ }
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
  if (isDemoMode) {
    writeLocal(payload);
    return { data: payload, storage: "local", fallbackReason: "Modo demonstração" };
  }

  // Revalida a sessão e o vínculo a cada gravação, inclusive chamadas sem UI.
  // A autorização definitiva continua sendo a RLS do Supabase.
  const access = await loadCommercialAccess();
  if (!access.canEdit) throw new Error(access.policyReady
    ? "Seu perfil permite somente leitura de metas e configurações."
    : "Edição operacional bloqueada até a aprovação e configuração das permissões no Supabase.");
  if (!supabase || access.clientId == null || !access.userId) throw new Error("Não foi possível confirmar a autorização de escrita.");

  const expected = { client_id: access.clientId, scope: MANUAL_SCOPE, payload: storagePayload(payload) };
  const { data, error } = await supabase.from("dashboard_manual_inputs").upsert({
    ...expected, updated_at: new Date().toISOString(),
  }, { onConflict: "client_id,scope" }).select("client_id,scope,payload");
  // Só confirma o formulário/cache depois da representação correta do banco.
  if (error) throw error;
  assertManualWriteConfirmed(data, expected);
  writeLocal(payload);
  return { data: payload, storage: "supabase" };
}

export const manualDataKey = ["manual-business-data", CLIENT_SLUG, "commercial-empty-v2"] as const;

export function useManualData() {
  const query = useQuery({ queryKey: manualDataKey, queryFn: loadManualData, staleTime: 60_000, retry: 1 });
  return {
    data: query.data?.data ?? (isDemoMode ? demoManualData : defaultManualData),
    storage: query.data?.storage ?? "local",
    fallbackReason: query.data?.fallbackReason,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
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
