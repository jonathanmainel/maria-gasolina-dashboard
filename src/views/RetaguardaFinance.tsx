import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../auth";
import { ExpandableTableFooter, useExpandableRows } from "../components/ui/expandable-table";
import { Kpi, Panel, Skeleton } from "../components/ui/primitives";
import { TableViewport } from "../components/ui/table-viewport";
import { CLIENT_SLUG, isDemoMode } from "../lib/api";
import { loadCommercialAccess } from "../lib/commercial-access";
import { dateTime, money } from "../lib/format";
import { reportingToday } from "../lib/reporting-period";
import { consolidateSpend, estimateAutonomy, hasRecentBalance, loadRetaguardaSpend, spendWindow, summarizeAccountSpend } from "../lib/retaguarda-spend";
import {
  financeOrigins, financePlatforms, financeQueryKey, financialAccountKey, financialAccountLabel, financialDays,
  loadFinancialAccounts, loadFinancialEntries, parseBrl, platformFinancialSummary, saveFinancialEntry,
  type FinancialAccount, type FinancialDraft, type FinancialEntry,
} from "../lib/retaguarda-finance";
import type { Channel, DateRange } from "../types";

const platforms = ["meta_ads", "google_ads"] as const;
const displayDate = (date: string) => format(parseISO(date), "dd/MM/yyyy");
const displayTime = (time: string | null) => time ? dateTime(time) : "Horário não informado";
const currency = (value: number | null) => value === null ? "Não informado" : money(value);
const formatDays = (value: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} dias`;
const noEntries: FinancialEntry[] = [];
const noAccounts: FinancialAccount[] = [];

export function RetaguardaFinance({ range, readOnly }: { range: DateRange; readOnly: boolean }) {
  const { session } = useAuth();
  const userId: string | undefined = session?.user?.id;
  const queryClient = useQueryClient();
  const enabled = Boolean(userId && !isDemoMode);
  const accountQuery = useQuery({
    queryKey: [...financeQueryKey, userId, "accounts"], queryFn: loadFinancialAccounts, enabled, retry: 1, staleTime: 60_000,
  });
  const dataKey = [...financeQueryKey, userId, "entries"] as const;
  const entries = useQuery({
    queryKey: [...dataKey, "all", reportingToday()], queryFn: () => loadFinancialEntries(), enabled, retry: 1,
    staleTime: 60_000, refetchInterval: 60_000,
  });
  const spend = useQuery({
    queryKey: ["retaguarda-spend", CLIENT_SLUG, userId], queryFn: loadRetaguardaSpend, enabled, retry: 1,
    refetchInterval: 60_000,
  });
  const access = useQuery({
    queryKey: ["commercial-access", CLIENT_SLUG, userId], queryFn: loadCommercialAccess,
    enabled: enabled && !readOnly, retry: 1, refetchInterval: 30_000,
  });
  const [editing, setEditing] = useState<FinancialEntry | "new" | null>(null);
  const [saved, setSaved] = useState(false);
  const accounts = accountQuery.isSuccess ? accountQuery.data : noAccounts;
  const data = entries.isSuccess ? entries.data : noEntries;
  const allDays = useMemo(() => financialDays(data), [data]);
  const days = useMemo(() => allDays.filter(({ current }) => current.reference_date >= range.start
    && current.reference_date <= range.end), [allDays, range.start, range.end]);
  const latest = useMemo(() => allDays.map((day) => day.current), [allDays]);
  const canEdit = enabled && !readOnly && access.isSuccess && access.data.canEdit && access.data.userId === userId
    && entries.isSuccess && accountQuery.isSuccess;
  const today = spend.data?.today ?? reportingToday();
  const lastDay = today;
  const canCreate = canEdit && accounts.some((account) => account.active);
  function edit(entry: FinancialEntry | "new") {
    setSaved(false);
    setEditing(entry);
  }

  return (
    <section aria-label="Financeiro da Retaguarda" className="retaguarda-finance">
      <div className="section-title">
        <h2>Resumo financeiro</h2>
        {canCreate && !editing && <button type="button" className="secondary-button" onClick={() => edit("new")}>Registrar saldo</button>}
      </div>
      {isDemoMode && <p className="retaguarda-finance-note">Dados financeiros indisponíveis no modo demonstração.</p>}
      {(entries.isError || accountQuery.isError) && (
        <div className="inline-error" role="alert">
          <span>Não foi possível carregar os registros de saldo ou as contas.</span>
          <button type="button" className="secondary-button" onClick={() => { void entries.refetch(); void accountQuery.refetch(); }}>Tentar novamente</button>
        </div>
      )}
      {enabled && accountQuery.isPending ? (
        <div role="status" aria-label="Carregando registros financeiros"><Skeleton height={170} /></div>
      ) : (
        <div className="grid grid-2">
          {platforms.map((platform) => <FinancePanel key={platform} platform={platform} accounts={accounts} latest={latest}
            today={today} balancePending={enabled && entries.isPending} balanceError={entries.isError || accountQuery.isError}
            spend={spend.data} spendError={spend.isError} spendPending={enabled && spend.isPending} />)}
        </div>
      )}
      {saved && <p className="retaguarda-finance-note" role="status">Registro financeiro salvo.</p>}
      {editing && canEdit && userId && (
        <FinanceForm key={`${range.start}:${range.end}:${editing === "new" ? "new" : editing.id}`}
          accounts={accounts} latest={latest} entry={editing === "new" ? undefined : editing} lastDay={lastDay}
          onCancel={() => { setEditing(null); void queryClient.invalidateQueries({ queryKey: dataKey }); }}
          onSave={async (draft) => {
            await saveFinancialEntry(draft, userId);
            setEditing(null);
            setSaved(true);
            void queryClient.invalidateQueries({ queryKey: dataKey });
          }} />
      )}
      <div className="section-title"><h2>Histórico financeiro</h2></div>
      {entries.isSuccess ? (
        <FinanceHistory key={`${range.start}:${range.end}`} range={range} accounts={accounts} days={days}
          onCorrect={canEdit && !editing ? edit : undefined} />
      ) : enabled && entries.isPending ? (
        <div role="status" aria-label="Carregando histórico financeiro"><Skeleton height={160} /></div>
      ) : (
        <div className="empty-state">{entries.isError ? "Histórico financeiro indisponível." : "Nenhum registro financeiro disponível."}</div>
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
        <Kpi label="Saldo disponível" value={summary.balance} format={money} accent={accent} icon={<Wallet size={16} />} hideDelta foot={summary.balance === null ? `${balanceNote} no resumo` : "Último saldo conhecido · independente do período"} />
        <Kpi label="Estimativa de gastos diários" value={estimate} format={money} accent={accent} icon={<CalendarDays size={16} />} hideDelta foot={estimateNote} />
      </div>
      {spend && <p className="retaguarda-finance-note">
        {displayDate(period.start)} a {displayDate(period.end)} · Última coleta {lastCollection ? displayTime(lastCollection) : "não registrada"}.
        {sync === "failed" ? " A última sincronização de mídia falhou." : sync === "indeterminate" ? " A última sincronização não foi confirmada."
          : sync === "unavailable" ? " Status da sincronização indisponível." : ""}
      </p>}
      {autonomy !== null && <p className="retaguarda-finance-note">Autonomia estimada da plataforma <strong>{formatDays(autonomy)}</strong>. Projeção pelo ritmo observado.</p>}
      {summary.date && <p className="retaguarda-finance-note">Referência do saldo conhecido em {displayDate(summary.date)}{items.some(item => !fresh(item.latest)) ? " · Medição desatualizada" : " · Medição recente"}.</p>}
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
              {entry && <span>{displayDate(entry.reference_date)} · {financeOrigins[entry.origin]} · Medição em {displayTime(entry.measured_at)}
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

function FinanceForm({ accounts, latest, entry, lastDay, onCancel, onSave }: {
  accounts: FinancialAccount[]; latest: FinancialEntry[]; entry?: FinancialEntry; lastDay: string;
  onCancel: () => void; onSave: (draft: FinancialDraft) => Promise<void>;
}) {
  const active = accounts.filter((account) => account.active);
  const [platform, setPlatform] = useState<Channel>(entry?.platform ?? active[0]?.platform ?? "meta_ads");
  const [accountId, setAccountId] = useState(entry?.account_id ?? active[0]?.account_id ?? "");
  const [date, setDate] = useState(entry?.reference_date ?? lastDay);
  const [balance, setBalance] = useState(entry?.available_balance_brl == null ? "" : money(entry.available_balance_brl));
  const [draft, setDraft] = useState<FinancialDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.closest("section")?.scrollIntoView?.({ block: "start" });
    form.current?.querySelector<HTMLElement>("select:not(:disabled), input:not(:disabled)")?.focus({ preventScroll: true });
  }, []);
  const choices = accounts.filter((account) => account.platform === platform && (account.active || account.account_id === entry?.account_id));
  const selected = choices.find((account) => account.account_id === accountId);
  const previous = entry ?? latest.find((row) => row.platform === platform && row.account_id === accountId && row.reference_date === date);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    if (!draft) {
      const parsedBalance = parseBrl(balance);
      if (!selected || !date || date > lastDay || parsedBalance === null) {
        setError("Selecione uma conta e uma data até hoje. Use valores em reais com até duas casas decimais, como 1.234,56.");
        return;
      }
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
    <Panel title={draft ? "Confirmar registro financeiro" : entry ? "Corrigir registro financeiro" : "Registrar saldo"} className="retaguarda-finance-form" noTilt>
      <form ref={form} onSubmit={(event) => void submit(event)} aria-label="Registro financeiro">
        {draft ? (
          <div className="retaguarda-finance-note">
            <p>{financePlatforms[platform]} · {selected && financialAccountLabel(selected)} · {displayDate(date)}</p>
            <p>Saldo {money(Number(draft.available_balance_brl))}</p>
            {draft.previous_id && <p>Este registro cria uma nova versão e mantém os valores anteriores no histórico.</p>}
          </div>
        ) : (
          <div className="form-grid">
            <Field label="Plataforma"><select value={platform} disabled={!!entry} onChange={(event) => {
              const next = event.target.value as Channel;
              setPlatform(next);
              setAccountId(active.find((account) => account.platform === next)?.account_id ?? "");
            }}>{platforms.map((item) => <option key={item} value={item}>{financePlatforms[item]}</option>)}</select></Field>
            <Field label="Conta de anúncios"><select value={accountId} disabled={!!entry} required onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Selecione uma conta</option>
              {choices.map((account) => <option key={account.account_id} value={account.account_id}>{financialAccountLabel(account)}</option>)}
            </select></Field>
            <Field label="Data de referência"><input type="date" required max={lastDay} value={date} disabled={!!entry} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Saldo disponível (BRL)"><input inputMode="decimal" required placeholder="0,00" value={balance} onChange={(event) => setBalance(event.target.value)} /></Field>
          </div>
        )}
        {error && <p className="retaguarda-finance-note" role="alert">{error}</p>}
        <div className="manual-actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={pending}>Cancelar</button>
          {draft && !error && <button type="button" className="secondary-button" onClick={() => setDraft(null)} disabled={pending}>Revisar valores</button>}
          <button type="submit" className="primary-button" disabled={pending} aria-busy={pending}>
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

function FinanceHistory({ range, accounts, days, onCorrect }: {
  range: DateRange; accounts: FinancialAccount[]; days: ReturnType<typeof financialDays>; onCorrect?: (entry: FinancialEntry) => void;
}) {
  const [platform, setPlatform] = useState<Channel | "">("");
  const [accountKey, setAccountKey] = useState("");
  const [date, setDate] = useState("");
  const accountNames = new Map(accounts.map((account) => [financialAccountKey(account), financialAccountLabel(account)]));
  const choices = new Map(days.filter(({ current }) => !platform || current.platform === platform).map(({ current }) => {
    const key = financialAccountKey(current);
    return [key, `${financePlatforms[current.platform]} · ${accountNames.get(key) ?? current.account_id}`];
  }));
  const filtered = days.filter(({ current }) => (!platform || current.platform === platform)
    && (!accountKey || financialAccountKey(current) === accountKey) && (!date || current.reference_date === date));
  const rows = useExpandableRows(filtered, JSON.stringify([platform, accountKey, date]), 5);
  if (!days.length) return <div className="empty-state">Nenhum registro financeiro no período.</div>;

  return (
    <>
      <div className="form-grid retaguarda-finance-filters">
        <Field label="Filtrar por plataforma"><select value={platform} onChange={(event) => { setPlatform(event.target.value as Channel | ""); setAccountKey(""); }}>
          <option value="">Todas as plataformas</option>
          {platforms.map((item) => <option key={item} value={item}>{financePlatforms[item]}</option>)}
        </select></Field>
        <Field label="Filtrar por conta"><select value={accountKey} onChange={(event) => setAccountKey(event.target.value)}>
          <option value="">Todas as contas</option>
          {[...choices].map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></Field>
        <Field label="Filtrar por data"><input type="date" min={range.start} max={range.end} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      </div>
      {!filtered.length ? <div className="empty-state">Nenhum registro para os filtros escolhidos.</div> : (
        <div className="table-wrap retaguarda-history retaguarda-finance-table">
          <TableViewport label="Colunas do histórico financeiro">
            <table aria-label="Histórico financeiro">
              <thead><tr>{["Data", "Plataforma e conta", "Saldo", "Estimativa registrada", "Medição e origem", "Versões e ações"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>{rows.visibleRows.map(({ current, versions }) => {
                const group = [current, ...versions];
                return <tr key={current.id}>
                  <th scope="row">{displayDate(current.reference_date)}</th>
                  <td>{financePlatforms[current.platform]} · {accountNames.get(financialAccountKey(current)) ?? current.account_id}</td>
                  <td>{currency(current.available_balance_brl)}</td>
                  <td>{currency(current.estimated_daily_spend_brl)}</td>
                  <td>{displayTime(current.measured_at)} · {financeOrigins[current.origin]}</td>
                  <td>
                    <details>
                      <summary>{group.length === 1 ? "Detalhes do registro" : `Consultar ${group.length} versões`}</summary>
                      <ol className="retaguarda-versions">{group.map((version, index) => <li key={version.id}>
                        <strong>{index === 0 ? "Versão vigente" : "Versão anterior"}</strong>
                        <span>Saldo {currency(version.available_balance_brl)} · Estimativa {currency(version.estimated_daily_spend_brl)}</span>
                        <span>{financeOrigins[version.origin]} · Medição em {displayTime(version.measured_at)}</span>
                        <span>Gravação em {dateTime(version.created_at)} · Autor {version.created_by ?? "não identificado"}</span>
                      </li>)}</ol>
                    </details>
                    {onCorrect && <button type="button" className="table-toggle" onClick={() => onCorrect(current)}>Corrigir</button>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </TableViewport>
          <ExpandableTableFooter rows={rows} summary="registros por conta e dia" />
        </div>
      )}
    </>
  );
}
