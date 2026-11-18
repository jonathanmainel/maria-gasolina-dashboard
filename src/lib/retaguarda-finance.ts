import { CLIENT_SLUG, fetchAllRows, getClientId, isDemoMode } from "./api";
import { supabase } from "./supabase";
import type { Channel, DateRange } from "../types";
export { parseBrl } from "./brl";

export interface FinancialAccount {
  platform: Channel;
  account_id: string;
  account_name: string | null;
  active: boolean;
}

export interface FinancialEntry {
  id: string;
  platform: Channel;
  account_id: string;
  reference_date: string;
  measured_at: string | null;
  available_balance_brl: number | null;
  estimated_daily_spend_brl: number | null;
  origin: "manual" | "import" | "api";
  created_by: string | null;
  created_at: string;
  previous_id: string | null;
}

export interface FinancialDraft {
  platform: Channel;
  account_id: string;
  reference_date: string;
  available_balance_brl: string;
  previous_id: string | null;
  request_key: string;
}

export const financeQueryKey = ["retaguarda-financial", CLIENT_SLUG] as const;
export const financePlatforms = { meta_ads: "Meta Ads", google_ads: "Google Ads" };
export const financeOrigins = { manual: "Registro manual", import: "Importação", api: "API da plataforma" };
const table = "dashboard_retaguarda_financial_entries";
const columns = "id,platform,account_id,reference_date,measured_at,available_balance_brl,estimated_daily_spend_brl,origin,created_by,created_at,previous_id";

export function financialAccountKey(account: Pick<FinancialAccount, "platform" | "account_id">) {
  return JSON.stringify([account.platform, account.account_id]);
}

export function financialAccountLabel(account: FinancialAccount) {
  return account.account_name ? `${account.account_name} · ${account.account_id}` : account.account_id;
}

export function financialDays(entries: FinancialEntry[]) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const superseded = new Set(entries.map((entry) => entry.previous_id));
  return [...byId.values()].filter((entry) => !superseded.has(entry.id)).map((current) => {
    const versions: FinancialEntry[] = [];
    for (let id = current.previous_id; id;) {
      const previous = byId.get(id);
      if (!previous) break;
      versions.push(previous);
      id = previous.previous_id;
    }
    return { current, versions };
  }).sort((a, b) => b.current.reference_date.localeCompare(a.current.reference_date)
    || a.current.platform.localeCompare(b.current.platform)
    || a.current.account_id.localeCompare(b.current.account_id));
}

export function platformFinancialSummary(accounts: FinancialAccount[], current: FinancialEntry[], platform: Channel) {
  const latestByAccount = new Map<string, FinancialEntry>();
  for (const entry of current) {
    if (entry.platform !== platform) continue;
    const previous = latestByAccount.get(entry.account_id);
    if (!previous || previous.reference_date < entry.reference_date) latestByAccount.set(entry.account_id, entry);
  }
  const items = accounts.filter((account) => account.active && account.platform === platform)
    .map((account) => ({ account, latest: latestByAccount.get(account.account_id) }));
  const date = items[0]?.latest?.reference_date;
  const aligned = Boolean(date && items.every(({ latest }) => latest?.reference_date === date));
  const balances = items.map(({ latest }) => latest?.available_balance_brl);
  const cents = balances.reduce<number>((total, balance) => total + Math.round((balance ?? 0) * 100), 0);
  const balance = aligned && balances.every(value => value != null) && Number.isSafeInteger(cents) ? cents / 100 : null;
  return { items, date: aligned ? date : undefined, balance };
}

export async function loadFinancialAccounts(): Promise<FinancialAccount[]> {
  if (isDemoMode) return [];
  if (!supabase) throw new Error("Conexão financeira indisponível.");
  const { data, error } = await supabase.rpc("get_retaguarda_financial_accounts", { p_client_id: await getClientId() });
  if (error) throw error;
  return data ?? [];
}

export async function loadFinancialEntries(range: DateRange): Promise<FinancialEntry[]> {
  if (isDemoMode) return [];
  const clientId = await getClientId();
  return fetchAllRows<FinancialEntry>(table, columns, (query) => query.eq("client_id", clientId)
    .gte("reference_date", range.start).lte("reference_date", range.end).order("created_at").order("id"));
}

export async function saveFinancialEntry(draft: FinancialDraft, expectedUser: string): Promise<void> {
  if (isDemoMode || !supabase) throw new Error("Gravação financeira indisponível.");
  const sessionMessage = "Sua sessão expirou ou mudou. Entre novamente antes de confirmar o registro.";
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session || session.user.id !== expectedUser) throw new Error(sessionMessage);
  const clientId = await getClientId();
  const authorization = `Bearer ${session.access_token}`;
  const { data, error, status } = await supabase.from(table).insert({ ...draft, client_id: clientId, estimated_daily_spend_brl: null })
    .select("id,created_by").single().setHeader("Authorization", authorization);
  if (!error && data?.id && data.created_by === expectedUser) return;
  if (status === 401) throw new Error(sessionMessage);
  if (error?.code === "42501" || status === 403) throw new Error("Seu perfil ou a conta selecionada não permite este registro.");

  // A request may have committed before its response was lost. Confirm the
  // authenticated author's exact payload before acknowledging the retry.
  const { data: existing, status: lookupStatus } = await supabase.from(table).select(columns).eq("client_id", clientId)
    .eq("request_key", draft.request_key).maybeSingle().setHeader("Authorization", authorization);
  if (existing?.created_by === expectedUser && existing.origin === "manual"
    && existing.platform === draft.platform && existing.account_id === draft.account_id
    && existing.reference_date === draft.reference_date && existing.previous_id === draft.previous_id
    && existing.available_balance_brl === Number(draft.available_balance_brl)
    && existing.estimated_daily_spend_brl === null) return;

  if (lookupStatus === 401) throw new Error(sessionMessage);
  if (existing) throw new Error("Este identificador já pertence a outro registro. Cancele e revise o histórico antes de enviar novamente.");
  if (error?.code === "23505") throw new Error("O histórico mudou. Cancele este envio, atualize o histórico e revise a versão mais recente.");
  throw new Error("Não foi possível confirmar a gravação. Tente novamente para verificar o mesmo envio.");
}
