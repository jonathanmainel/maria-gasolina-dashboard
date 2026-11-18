import { CLIENT_SLUG, getClientId, isDemoMode } from "./api";
import { supabase } from "./supabase";
import type { FinancialEntry } from "./retaguarda-finance";

export interface MetaBalanceStatus {
  account_id: string;
  status: "running" | "success" | "failed" | "conflict" | "indeterminate" | null;
  requested_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  entry_id: string | null;
  overdue: boolean;
  allowed?: boolean;
  retry_at?: string | null;
  manual_blocked_today?: boolean;
}
export interface MetaBalanceAvailability {
  available: boolean; can_request: boolean; reason: string | null; server_time: string; accounts: MetaBalanceStatus[];
}
export class MetaBalanceRequestError extends Error {
  constructor(message: string, public readonly discardRequestKey: boolean) { super(message); }
}
export async function loadLatestBalances(): Promise<FinancialEntry[]> {
  if (isDemoMode) return [];
  if (!supabase) throw new Error("Leitura financeira indisponível.");
  const { data, error } = await supabase.rpc("get_retaguarda_latest_balances", { p_client_id: await getClientId() });
  if (error) throw error;
  return data ?? [];
}
export async function loadMetaBalanceStatus(): Promise<MetaBalanceAvailability> {
  if (isDemoMode) return { available: false, can_request: false, reason: "DEMO", server_time: new Date().toISOString(), accounts: [] };
  if (!supabase) throw new Error("Estado da coleta financeira indisponível.");
  const { data, error } = await supabase.functions.invoke("request-meta-balance", { body: { action: "status", client_slug: CLIENT_SLUG } });
  if (error) throw error;
  if (!data || typeof data.available !== "boolean" || typeof data.can_request !== "boolean" || !Array.isArray(data.accounts)
    || !Number.isFinite(Date.parse(data.server_time))) throw new Error("Disponibilidade financeira não confirmada.");
  return data;
}
export function metaBalanceMessage(status: MetaBalanceStatus | undefined): string {
  if (!status?.status) return "Nenhuma coleta financeira registrada.";
  if (status.overdue || status.status === "indeterminate") return "Coleta sem confirmação. Aguarde a verificação antes de tentar novamente.";
  if (status.status === "conflict") return "Saldo manual/importado ou histórico preservado. A coleta horária também ficará bloqueada neste dia; conciliação necessária.";
  if (status.status === "running") return "Consultando fundos disponíveis na Meta…";
  if (status.status === "failed") return "Falha na consulta financeira. O último saldo confirmado foi preservado.";
  return "Saldo confirmado pela Meta Ads API.";
}
export async function requestMetaBalance(accountId: string, requestKey: string, expectedUser: string): Promise<{ state: string }> {
  if (!supabase || isDemoMode) throw new Error("Coleta financeira indisponível no modo demonstração.");
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session || session.user.id !== expectedUser) throw new Error("Sua sessão expirou ou mudou. Entre novamente.");
  const { data, error } = await supabase.functions.invoke("request-meta-balance", {
    body: { client_slug: CLIENT_SLUG, account_id: accountId, request_key: requestKey },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    let code: string | undefined;
    let state: string | undefined;
    try { const body = await response?.clone().json(); code = body?.error_code; state = body?.state; } catch { /* safe generic message */ }
    if (code === "BALANCE_NOT_HOMOLOGATED") throw new MetaBalanceRequestError("Coleta automática ainda não homologada. O saldo manual continua disponível.", true);
    if (response?.status === 401) throw new MetaBalanceRequestError("Sua sessão expirou. Entre novamente.", true);
    if (response?.status === 403) throw new MetaBalanceRequestError("Seu perfil não permite consultar um novo saldo desta conta.", true);
    if (response?.status === 409) throw new MetaBalanceRequestError("O saldo manual/importado ou uma alteração concorrente foi preservado. Revise o histórico.", true);
    if (response?.status === 429) throw new MetaBalanceRequestError("Aguarde o intervalo mínimo entre coletas desta conta.", true);
    if (response?.status === 502 && state === "failed") throw new MetaBalanceRequestError("A consulta financeira falhou. O último saldo foi mantido; aguarde o intervalo antes de uma nova coleta.", true);
    throw new MetaBalanceRequestError("Não foi possível confirmar a coleta. Consulte o estado antes de tentar novamente.", false);
  }
  if (!data || !["success", "running", "indeterminate", "failed", "conflict"].includes(data.state))
    throw new Error("Resposta da coleta não confirmada. Consulte o estado antes de tentar novamente.");
  return data;
}
