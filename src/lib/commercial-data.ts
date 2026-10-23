import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { CLIENT_SLUG, isDemoMode } from "./api";
import { supabase } from "./supabase";
import { commercialFronts } from "./fronts";
import { loadCommercialAccess } from "./commercial-access";
import { commercialPayload, commercialScope, decodeCommercialRows, emptyCommercialEntries, type CommercialCommand, type CommercialRow } from "./commercial-records";
import { commercialExamples } from "./commercial-examples";
import type { DateRange } from "../types";

const DEMO_KEY = `mg-sales-demo-v1:${CLIENT_SLUG}`;
export const commercialQueryKey = ["commercial-records-v1", CLIENT_SLUG, isDemoMode ? "demo" : "operational"] as const;
function demoRows(range: DateRange): CommercialRow[] {
  try { const saved = window.localStorage.getItem(DEMO_KEY); if (saved) return JSON.parse(saved) as CommercialRow[]; } catch { /* exemplos isolados em navegador sem storage */ }
  // Usado somente no modo global demo; não há fallback para o armazenamento antigo.
  return Object.entries(commercialExamples).flatMap(([id, example]) => {
    const front = id as CommercialCommand["front"];
    return (["snapshot", "result"] as const).map(kind => ({ scope: commercialScope(front, kind, range), updated_at: new Date().toISOString(), payload: commercialPayload({ front, kind, range, values: kind === "snapshot" ? example.snapshot : example.result }) }));
  });
}
export async function loadCommercialRows(range: DateRange): Promise<CommercialRow[]> {
  if (isDemoMode) return demoRows(range);
  if (!supabase) return [];
  const { data: client, error: clientError } = await supabase.from("dashboard_clients").select("id").eq("slug", CLIENT_SLUG).maybeSingle();
  if (clientError) throw clientError;
  if (!client) return [];
  const scopes = Object.values(commercialFronts).flatMap(front => [commercialScope(front.id, "snapshot", range), commercialScope(front.id, "result", range)]);
  const { data, error } = await supabase.from("dashboard_manual_inputs").select("scope,payload,updated_at,updated_by").eq("client_id", client.id).in("scope", scopes);
  if (error) throw error;
  return (data ?? []) as CommercialRow[];
}
export async function saveCommercialRecord(command: CommercialCommand): Promise<void> {
  const payload = commercialPayload(command);
  const scope = commercialScope(command.front, command.kind, command.range);
  const access = await loadCommercialAccess();
  if (!access.canEdit) throw new Error(access.policyReady ? "Seu perfil permite somente leitura dos dados comerciais." : "Edição operacional bloqueada até a aprovação e configuração das permissões no Supabase.");
  const row: CommercialRow = { scope, payload, updated_at: new Date().toISOString(), updated_by: access.userId };
  if (isDemoMode) {
    const rows = demoRows(command.range).filter(item => item.scope !== scope);
    window.localStorage.setItem(DEMO_KEY, JSON.stringify([...rows, row]));
    return;
  }
  if (!supabase || access.clientId == null || !access.userId) throw new Error("Não foi possível confirmar a autorização de escrita.");
  const { error } = await supabase.from("dashboard_manual_inputs").upsert({ ...row, client_id: access.clientId }, { onConflict: "client_id,scope" });
  if (error) throw error;
}
export type CommercialDeleteCommand = Pick<CommercialCommand, "front" | "kind" | "range">;
export async function deleteCommercialRecord(command: CommercialDeleteCommand): Promise<void> {
  const scope = commercialScope(command.front, command.kind, command.range);
  const access = await loadCommercialAccess();
  if (!access.policyReady || !access.canManage || access.role !== "admin") throw new Error("Somente admin autorizado pode excluir registros comerciais.");
  if (isDemoMode) throw new Error("Exemplos demonstrativos não podem ser excluídos da operação.");
  if (!supabase || access.clientId == null || !access.userId) throw new Error("Não foi possível confirmar a autorização de exclusão.");
  const { data, error } = await supabase.from("dashboard_manual_inputs").delete().eq("client_id", access.clientId).eq("scope", scope).select("scope");
  if (error) throw error;
  if (data?.length !== 1 || data[0].scope !== scope) throw new Error("Nenhum registro excluído. O acesso pode ter mudado ou o registro já não existe.");
}
export function useCommercialData(range: DateRange) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const records = useQuery({ queryKey: [...commercialQueryKey, userId, range.start, range.end], queryFn: () => loadCommercialRows(range), staleTime: 30_000, refetchInterval: 60_000 });
  const access = useQuery({ queryKey: ["commercial-access", CLIENT_SLUG, isDemoMode ? "demo" : userId], queryFn: loadCommercialAccess, staleTime: 0, refetchInterval: 30_000 });
  return { entries: records.data ? decodeCommercialRows(records.data, range) : emptyCommercialEntries(), access: access.data, isLoading: records.isLoading, isError: records.isError, error: records.error, refetch: records.refetch };
}
export function useSaveCommercialRecord() {
  const client = useQueryClient();
  return useMutation({ mutationFn: saveCommercialRecord, onSuccess: () => client.invalidateQueries({ queryKey: commercialQueryKey }) });
}
export function useDeleteCommercialRecord() {
  const client = useQueryClient();
  return useMutation({ mutationFn: deleteCommercialRecord, onSuccess: () => client.invalidateQueries({ queryKey: commercialQueryKey }) });
}
