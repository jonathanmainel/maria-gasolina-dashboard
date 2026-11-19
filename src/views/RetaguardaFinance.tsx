import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth";
import { Kpi, Panel, Skeleton } from "../components/ui/primitives";
import { CLIENT_SLUG, isDemoMode } from "../lib/api";
import { MetaBalanceRefresh } from "../components/MetaBalanceRefresh";
import { loadLatestBalances } from "../lib/meta-balance";
import { loadCommercialAccess } from "../lib/commercial-access";
import { dateTime, money } from "../lib/format";
import { reportingToday } from "../lib/reporting-period";
import { consolidateSpend, estimateAutonomy, hasRecentBalance, loadRetaguardaSpend, spendWindow, summarizeAccountSpend } from "../lib/retaguarda-spend";
import {
  financeOrigins, financePlatforms, financeQueryKey, financialAccountLabel,
  loadFinancialAccounts, loadFinancialDayEntries, parseBrl, platformFinancialSummary, saveFinancialEntry,
  type FinancialAccount, type FinancialDraft, type FinancialEntry,
} from "../lib/retaguarda-finance";
import type { Channel, DateRange } from "../types";

const platforms = ["meta_ads", "google_ads"] as const;
const displayDate = (date: string) => format(parseISO(date), "dd/MM/yyyy");
const displayTime = (time: string | null) => time ? dateTime(time) : "Horário não informado";
const formatDays = (value: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} dias`;
const noEntries: FinancialEntry[] = [];
const noAccounts: FinancialAccount[] = [];

export function RetaguardaFinance({ readOnly }: { range: DateRange; readOnly: boolean }) {
  const { session } = useAuth();
  const userId: string | undefined = session?.user?.id;
  const queryClient = useQueryClient();
  const enabled = Boolean(userId && !isDemoMode);
  const accountQuery = useQuery({
    queryKey: [...financeQueryKey, userId, "accounts"], queryFn: loadFinancialAccounts, enabled, retry: 1, staleTime: 60_000,
  });
  const currentBalances = useQuery({
    queryKey: [...financeQueryKey, userId, "latest"], queryFn: loadLatestBalances, enabled, retry: 1, refetchInterval: 60_000,
  });
  const spend = useQuery({
    queryKey: ["retaguarda-spend", CLIENT_SLUG, userId], queryFn: loadRetaguardaSpend, enabled, retry: 1,
    refetchInterval: 60_000,
  });
  const access = useQuery({
    queryKey: ["commercial-access", CLIENT_SLUG, userId], queryFn: loadCommercialAccess,
    enabled: enabled && !readOnly, retry: 1, refetchInterval: 30_000,
  });
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const accounts = accountQuery.isSuccess ? accountQuery.data : noAccounts;
  const latest = currentBalances.data ?? noEntries;
  const canEdit = enabled && !readOnly && access.isSuccess && access.data.canEdit && access.data.userId === userId
    && accountQuery.isSuccess;
  const today = spend.data?.today ?? reportingToday();
  const lastDay = today;
  const canCreate = canEdit && accounts.some((account) => account.active);
  function edit() {
    setSaved(false);
    setEditing(true);
  }

  return (
    <section aria-label="Financeiro da Retaguarda" className="retaguarda-finance">
      <div className="section-title">
        <h2>Resumo financeiro</h2>
        {canCreate && !editing && <button type="button" className="secondary-button" onClick={edit}>Registrar saldo</button>}
      </div>
      {isDemoMode && <p className="retaguarda-finance-note">Dados financeiros indisponíveis no modo demonstração.</p>}
      {enabled && userId && accounts.some(account => account.active && account.platform === "meta_ads") && (
        <MetaBalanceRefresh key={userId} userId={userId} canEdit={canEdit}
          accountIds={accounts.filter(account => account.active && account.platform === "meta_ads").map(account => account.account_id)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: [...financeQueryKey, userId, "latest"] })} />
      )}
      {accountQuery.isError && (
        <div className="inline-error" role="alert">
          <span>Não foi possível carregar os registros de saldo ou as contas.</span>
          <button type="button" className="secondary-button" onClick={() => { void accountQuery.refetch(); }}>Tentar novamente</button>
        </div>
      )}
      {enabled && accountQuery.isPending ? (
        <div role="status" aria-label="Carregando registros financeiros"><Skeleton height={170} /></div>
      ) : (
        <div className="grid grid-2">
          {platforms.map((platform) => <FinancePanel key={platform} platform={platform} accounts={accounts} latest={latest}
            today={today} balancePending={enabled && currentBalances.isPending} balanceError={currentBalances.isError || accountQuery.isError}
            spend={spend.data} spendError={spend.isError} spendPending={enabled && spend.isPending} />)}
        </div>
      )}
      {saved && <p className="retaguarda-finance-note" role="status">Registro financeiro salvo.</p>}
      {editing && canEdit && userId && (
        <FinanceForm accounts={accounts} userId={userId} lastDay={lastDay}
          onCancel={() => setEditing(false)}
          onSave={async (draft) => {
            await saveFinancialEntry(draft, userId);
            setEditing(false);
            setSaved(true);
            void queryClient.invalidateQueries({ queryKey: [...financeQueryKey, userId, "day-head"] });
            void queryClient.invalidateQueries({ queryKey: [...financeQueryKey, userId, "latest"] });
          }} />
      )}
    </section>
  );
}

function FinancePanel({ platform, accounts, latest, today, balancePending, balanceError, spend, spendError, spendPending }: {
  platform: Channel; accounts: FinancialAccount[]; latest: FinancialEntry[]; today: string;
  balancePending: boolean; balanceError: boolean;
  spend?: Awaited<ReturnType<typeof loadRetaguardaSpend>>; spendError: boolean; spendPending: boolean;
}) {
  const summary = platformFinancialSummary(accounts, latest, platform);
  const accent = platform === "meta_ads" ? "sky" : "green";
  const coverage = summary.items.filter(({ latest }) => latest?.available_balance_brl != null).length;
  const period = spendWindow(today);
  const sync = spend?.sync.get(platform);
  const failed = sync === "failed" || sync === "indeterminate";
  const fresh = (entry: FinancialEntry | undefined) => !!entry && hasRecentBalance(entry.reference_date, entry.measured_at, today);
  const items = summary.items.map(item => ({ ...item, spend: summarizeAccountSpend(spend?.days ?? [], platform, item.account.account_id, today) }));
  const estimate = consolidateSpend(items.map(item => item.spend.estimate));
  const autonomy = estimateAutonomy(summary.balance, estimate, !spendError && !failed && items.every(item => fresh(item.latest)));
  const lastCollection = items.map(item => item.spend.lastCollection).filter((date): date is string => date !== null)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const estimateNote = spendPending ? "Carregando gastos observados" : spendError ? "Falha ao consultar os gastos"
    : "Média dos últimos 7 dias completos";
  const balanceNote = balancePending ? "Carregando saldos" : balanceError ? "Falha ao consultar o saldo" : "Saldo não informado";
  return (
    <Panel title={financePlatforms[platform]} description={summary.items.length
      ? `${coverage} de ${summary.items.length} contas ativas com saldo conhecido`
      : "Nenhuma conta ativa disponível"} noTilt>
      <div className="grid grid-2">
        <Kpi label="Saldo disponível" value={summary.balance} format={money} accent={accent} icon={<Wallet size={16} />} hideDelta foot={summary.balance === null ? `${balanceNote} no resumo` : undefined} />
        <Kpi label="Estimativa de gastos diários" value={estimate} format={money} accent={accent} icon={<CalendarDays size={16} />} hideDelta foot={estimateNote} />
      </div>
      {spend && <p className="retaguarda-finance-note">
        {displayDate(period.start)} a {displayDate(period.end)} · Última coleta {lastCollection ? displayTime(lastCollection) : "não registrada"}.
        {sync === "failed" ? " A última sincronização de mídia falhou." : sync === "indeterminate" ? " A última sincronização não foi confirmada."
          : sync === "unavailable" ? " Status da sincronização indisponível." : ""}
      </p>}
      {autonomy !== null && <p className="retaguarda-finance-note">Autonomia estimada da plataforma <strong>{formatDays(autonomy)}</strong>. Projeção pelo ritmo observado.</p>}
      {summary.date && <p className="retaguarda-finance-note">Último saldo conhecido em {displayDate(summary.date)} · independente do período{summary.items.some(item => !fresh(item.latest)) ? " · Medição desatualizada" : ""}.</p>}
      {summary.items.length > 1 && !summary.date && <p className="retaguarda-finance-note">O total por plataforma requer registros de todas as contas ativas com a mesma data de referência.</p>}
      {!!summary.items.length && (
        <ul className="retaguarda-accounts">
          {items.map(({ account, latest: entry, spend: accountSpend }) => {
            const accountAutonomy = estimateAutonomy(entry?.available_balance_brl, accountSpend.estimate, fresh(entry) && !failed && !spendError);
            return <li key={account.account_id}>
              <strong>{financialAccountLabel(account)}</strong>
              <span>{entry?.available_balance_brl == null ? balanceNote : `Saldo ${money(entry.available_balance_brl)}`}</span>
              {spend && <span>{accountSpend.estimate === null
                ? `Estimativa indisponível · ${accountSpend.validDays} de 7 dias válidos em BRL${accountSpend.unverifiedCurrency ? " · Moeda não confirmada em BRL" : ""}`
                : `${money(accountSpend.estimate)} por dia · 7 de 7 dias em BRL`}</span>}
              {items.length > 1 && accountSpend.lastCollection && <span>Última coleta {displayTime(accountSpend.lastCollection)}</span>}
              {entry && <span>{displayDate(entry.reference_date)} · {entry.origin === "api" && platform === "meta_ads" ? "Meta Ads API" : financeOrigins[entry.origin]} · Medição em {displayTime(entry.measured_at)}
                {!fresh(entry) && " · Sem medição recente para a projeção"}</span>}
              {accountAutonomy !== null && <span>Autonomia estimada {formatDays(accountAutonomy)}</span>}
              {accountSpend.estimate === 0 && <span>Autonomia indisponível com gasto médio zero.</span>}
            </li>;
          })}
        </ul>
      )}
    </Panel>
  );
}

function FinanceForm({ accounts, userId, lastDay, onCancel, onSave }: {
  accounts: FinancialAccount[]; userId: string; lastDay: string;
  onCancel: () => void; onSave: (draft: FinancialDraft) => Promise<void>;
}) {
  const active = accounts.filter((account) => account.active);
  const [platform, setPlatform] = useState<Channel>(active[0]?.platform ?? "meta_ads");
  const [accountId, setAccountId] = useState(active[0]?.account_id ?? "");
  const [date, setDate] = useState(lastDay);
  const [balance, setBalance] = useState("");
  const [draft, setDraft] = useState<FinancialDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.closest("section")?.scrollIntoView?.({ block: "start" });
    form.current?.querySelector<HTMLElement>("select:not(:disabled), input:not(:disabled)")?.focus({ preventScroll: true });
  }, []);
  const choices = active.filter((account) => account.platform === platform);
  const selected = choices.find((account) => account.account_id === accountId);
  const dayHead = useQuery({ queryKey: [...financeQueryKey, userId, "day-head", platform, accountId, date],
    queryFn: () => loadFinancialDayEntries(platform, accountId, date),
    enabled: !!selected && !!date && date <= lastDay, retry: 1, staleTime: 0, refetchOnWindowFocus: false });
  const previous = dayHead.data?.[0];
  useEffect(() => {
    setBalance(previous?.available_balance_brl == null ? "" : money(previous.available_balance_brl));
    setDraft(null); setError("");
  }, [platform, accountId, date, previous?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    if (!draft) {
      const parsedBalance = parseBrl(balance);
      if (!selected || !date || date > lastDay || parsedBalance === null) {
        setError("Selecione uma conta e uma data até hoje. Use valores em reais com até duas casas decimais, como 1.234,56.");
        return;
      }
      if (!dayHead.isSuccess) { setError("Aguarde a confirmação da versão vigente para esta conta/data."); return; }
      setError("");
      setDraft({ platform, account_id: accountId, reference_date: date, available_balance_brl: parsedBalance,
        previous_id: previous?.id ?? null, request_key: crypto.randomUUID() });
      return;
    }
    locked.current = true;
    setPending(true);
    setError("");
    try {
      await onSave(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar a gravação.");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <Panel title={draft ? "Confirmar registro financeiro" : previous ? "Corrigir saldo vigente" : "Registrar saldo"} className="retaguarda-finance-form" noTilt>
      <form ref={form} onSubmit={(event) => void submit(event)} aria-label="Registro financeiro">
        {draft ? (
          <div className="retaguarda-finance-note">
            <p>{financePlatforms[platform]} · {selected && financialAccountLabel(selected)} · {displayDate(date)}</p>
            <p>Saldo {money(Number(draft.available_balance_brl))}</p>
            {draft.previous_id && <p>Este registro cria uma nova versão, preservando o registro anterior no banco.</p>}
          </div>
        ) : (
          <div className="form-grid">
            <Field label="Plataforma"><select value={platform} onChange={(event) => {
              const next = event.target.value as Channel;
              setPlatform(next);
              setAccountId(active.find((account) => account.platform === next)?.account_id ?? "");
            }}>{platforms.map((item) => <option key={item} value={item}>{financePlatforms[item]}</option>)}</select></Field>
            <Field label="Conta de anúncios"><select value={accountId} required onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Selecione uma conta</option>
              {choices.map((account) => <option key={account.account_id} value={account.account_id}>{financialAccountLabel(account)}</option>)}
            </select></Field>
            <Field label="Data de referência"><input type="date" required max={lastDay} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Saldo disponível (BRL)"><input inputMode="decimal" required disabled={!dayHead.isSuccess} placeholder="0,00" value={balance} onChange={(event) => setBalance(event.target.value)} /></Field>
          </div>
        )}
        {dayHead.isPending && <p role="status">Consultando registro vigente da conta/data…</p>}
        {dayHead.isError && <p role="alert">Não foi possível confirmar o registro vigente. <button type="button" className="secondary-button" onClick={() => void dayHead.refetch()}>Tentar novamente</button></p>}
        {error && <p className="retaguarda-finance-note" role="alert">{error}</p>}
        <div className="manual-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Cancelar</button>
          {draft && !error && <button type="button" className="secondary-button" onClick={() => setDraft(null)} disabled={pending}>Revisar valores</button>}
          <button type="submit" className="primary-button" disabled={pending || !dayHead.isSuccess} aria-busy={pending}>
            {pending ? "Salvando…" : draft ? "Confirmar e salvar" : "Revisar registro"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

