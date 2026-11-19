import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Info, Wallet, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Popover } from "../components/ui/popover";
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
            refreshControl={platform === "meta_ads" && enabled && userId && accounts.some(account => account.active && account.platform === "meta_ads")
              ? <MetaBalanceRefresh key={userId} userId={userId} canEdit={canEdit}
                  accountIds={accounts.filter(account => account.active && account.platform === "meta_ads").map(account => account.account_id)}
                  onRefresh={() => queryClient.invalidateQueries({ queryKey: [...financeQueryKey, userId, "latest"] })} /> : undefined}
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

function FinancePanel({ platform, accounts, latest, today, balancePending, balanceError, spend, spendError, spendPending, refreshControl }: {
  platform: Channel; accounts: FinancialAccount[]; latest: FinancialEntry[]; today: string;
  balancePending: boolean; balanceError: boolean;
  spend?: Awaited<ReturnType<typeof loadRetaguardaSpend>>; spendError: boolean; spendPending: boolean;
  refreshControl?: ReactNode;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const infoAnchor = useRef<HTMLButtonElement>(null);
  const closeDetails = useCallback(() => setDetailsOpen(false), []);
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
  const balanceNote = balancePending ? "Carregando saldos" : balanceError ? "Falha ao consultar o saldo"
    : coverage > 0 && items.length > 1 ? "Saldo consolidado indisponível" : "Saldo não informado";
  const financialTime = items.filter(item => item.latest?.available_balance_brl != null).map(item => item.latest?.measured_at)
    .filter((time): time is string => !!time).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const stale = items.some(item => item.latest && !fresh(item.latest));
  const partialSpend = spend && estimate === null && !spendPending && !spendError;
  return (
    <Panel className="retaguarda-finance-card" noTilt>
      <header className="finance-card-head">
        <div className="finance-card-title">
          <h3>{financePlatforms[platform]}</h3>
          <button ref={infoAnchor} type="button" className="finance-info-button" aria-label={`Informações financeiras de ${financePlatforms[platform]}`}
            aria-haspopup="dialog" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(true)}><Info size={17} /></button>
        </div>
        {refreshControl}
      </header>
      <div className="grid grid-2 finance-card-kpis">
        <Kpi label="Saldo disponível" value={summary.balance} format={money} accent={accent} icon={<Wallet size={16} />} hideDelta foot={summary.balance === null ? balanceNote : undefined} />
        <Kpi label="Gasto médio diário" value={estimate} format={money} accent={accent} icon={<CalendarDays size={16} />} hideDelta
          foot={partialSpend ? items.length === 1 ? `${items[0].spend.validDays} de 7 dias válidos em BRL` : "Histórico incompleto · consulte as contas" : estimateNote} />
      </div>
      <footer className="finance-card-foot">
        {autonomy !== null && <span>Autonomia estimada: <strong>{formatDays(autonomy)}</strong></span>}
        <span>{financialTime ? `Última medição: ${displayTime(financialTime)}` : summary.date
          ? `Referência financeira: ${displayDate(summary.date)}` : lastCollection ? `Coleta de gastos: ${displayTime(lastCollection)}` : "Sem atualização financeira"}</span>
        {stale && <span className="finance-stale">Saldo desatualizado</span>}
        {items.length > 1 && <span>{coverage} de {items.length} contas ativas com saldo conhecido</span>}
      </footer>
      {items.length > 1 && !summary.date && <p className="finance-card-warning">O total por plataforma requer registros de todas as contas ativas com a mesma data de referência.</p>}
      {failed && <p className="finance-card-warning" role="status">{sync === "failed" ? "A última sincronização de mídia falhou." : "A última sincronização não foi confirmada."}</p>}
      {sync === "unavailable" && <p className="finance-card-warning" role="status">Status da sincronização indisponível.</p>}
      {!items.length && <p className="finance-card-warning">Nenhuma conta ativa disponível</p>}
      <Popover open={detailsOpen} onClose={closeDetails} anchorRef={infoAnchor} label={`Informações financeiras de ${financePlatforms[platform]}`} width={430} align="start" className="finance-details">
        <header><h4>{financePlatforms[platform]} · Detalhes financeiros</h4><button type="button" className="finance-info-button" aria-label={`Fechar detalhes de ${financePlatforms[platform]}`} onClick={closeDetails}><X size={18} /></button></header>
        <p>Gasto médio: {displayDate(period.start)} a {displayDate(period.end)}, últimos sete dias completos. Não é orçamento de campanha.</p>
        <ul className="retaguarda-accounts">
          {items.map(({ account, latest: entry, spend: accountSpend }, index) => <li key={account.account_id}>
            <strong>{items.length > 1 && `Conta ${index + 1} · `}{account.account_name || financePlatforms[platform]}</strong>
            <span>ID: {account.account_id}</span>
            <span>{entry?.available_balance_brl == null ? "Saldo não informado" : `Origem do saldo: ${entry.origin === "api" && platform === "meta_ads" ? "Meta Ads API · confirmado pela API oficial" : financeOrigins[entry.origin]}`}</span>
            {items.length > 1 && <span>Saldo: {entry?.available_balance_brl == null ? "Não informado" : money(entry.available_balance_brl)} · Gasto médio diário: {accountSpend.estimate === null ? "Indisponível" : money(accountSpend.estimate)}</span>}
            {entry && <span>{displayDate(entry.reference_date)} · Medição em {displayTime(entry.measured_at)}{!fresh(entry) && " · Saldo desatualizado"}</span>}
            <span>Última coleta de gastos: {accountSpend.lastCollection ? displayTime(accountSpend.lastCollection) : "não registrada"}</span>
            {spend && <span>{accountSpend.validDays} de 7 dias válidos em BRL{accountSpend.unverifiedCurrency && " · Moeda não confirmada em BRL"}</span>}
            {accountSpend.estimate === 0 && <span>Autonomia indisponível com gasto médio zero.</span>}
          </li>)}
        </ul>
        <p>A autonomia divide o saldo confirmado pelo gasto médio observado. É uma projeção, não uma garantia; depende de saldo recente e dados completos.</p>
        {platform === "meta_ads" && <p>A consulta financeira é independente da sincronização das campanhas.</p>}
      </Popover>
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

