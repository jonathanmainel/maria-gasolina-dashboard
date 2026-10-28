import { ChevronDown, RefreshCw, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { CLIENT_SLUG, isDemoMode } from "../lib/api";
import { reloadDashboardData } from "../lib/data-refresh";
import { activeMarketingRun, getMarketingSyncStatus, marketingSources, requestMarketingSync, sourceLabels, syncStateLabel, type MarketingSource, type MarketingRun } from "../lib/marketing-sync";
import type { DateRange } from "../types";
import { Popover } from "./ui/popover";
import "./data-sync.css";

const time = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Sem registro";
const day = (value: string | null) => value ? value.split("-").reverse().join("/") : "Sem dados";
type Props = { range: DateRange; onShowToday?: (today: string) => void; readOnly?: boolean };

export function DataRefreshPanel(props: Props) {
  const { session } = useAuth();
  if (isDemoMode) return <span className="topbar-query-status">Demonstração · coleta desativada</span>;
  if (!session?.user?.id) return null;
  return <ConnectedRefresh {...props} userId={session.user.id} />;
}

function ConnectedRefresh({ range, onShowToday, readOnly = false, userId }: Props & { userId: string }) {
  const client = useQueryClient();
  const anchor = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const requestKey = useRef<string | null>(null);
  const observed = useRef(new Map<string, MarketingRun["status"]>());
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [requestedRuns, setRequestedRuns] = useState<Record<string, string>>({});
  const [blockedCount, setBlockedCount] = useState(0);
  const [watched, setWatched] = useState<Record<string, string>>({});
  const close = useCallback(() => { setOpen(false); anchor.current?.focus(); }, []);
  const status = useQuery({
    queryKey: ["marketing-sync", CLIENT_SLUG, userId, Object.values(requestedRuns).join(",")], queryFn: () => getMarketingSyncStatus(Object.values(requestedRuns)),
    retry: false, staleTime: 0,
    refetchInterval: query => [...(query.state.data?.requested_runs ?? []), ...(query.state.data?.sources.map(source => source.latest_run) ?? [])].some(run => run && ["queued", "running"].includes(run.status) && !run.overdue) || Object.keys(watched).some(source => !query.state.data?.requested_runs?.some(run => run.id === watched[source])) ? 3000 : 60000,
  });
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { observed.current.clear(); requestKey.current = null; setWatched({}); setNotice(""); }, [userId]);
  useEffect(() => {
    const completed: MarketingSource[] = [];
    const resolved: string[] = [];
    for (const source of status.data?.sources ?? []) {
      const run = status.data?.requested_runs?.find(run => run.id === requestedRuns[source.source]) ?? source.latest_run;
      if (!run) continue;
      const previous = observed.current.get(run.id);
      if (run.status === "success" && (watched[source.source] === run.id || (previous && previous !== "success"))) completed.push(source.source);
      if (watched[source.source] === run.id && !activeMarketingRun(run)) resolved.push(source.source);
      observed.current.set(run.id, run.status);
    }
    if (resolved.length) {
      setWatched(current => Object.fromEntries(Object.entries(current).filter(([source]) => !resolved.includes(source))));
      if (resolved.length === Object.keys(watched).length) {
        const failed = (status.data?.requested_runs ?? []).some(run => Object.values(requestedRuns).includes(run.id) && run.status === "failed");
        setNotice(failed || blockedCount ? "Atualização parcialmente concluída. Confira o resultado de cada fonte." : "Atualização concluída e confirmada pelas plataformas.");
      }
    }
    if (completed.length) void reloadDashboardData(client).catch(() => setNotice("Coleta confirmada, mas a leitura dos gráficos falhou. Os dados salvos continuam disponíveis."));
  }, [status.data, client, watched, requestedRuns, blockedCount]);
  const mutation = useMutation({
    mutationFn: async () => {
      requestKey.current ??= crypto.randomUUID();
      return requestMarketingSync([...marketingSources], requestKey.current);
    }, retry: false,
    onSuccess: async result => {
      const ids = Object.fromEntries(result.results.filter(row => row.run_id).map(row => [row.source, row.run_id!]));
      setRequestedRuns(ids); setWatched(ids); setBlockedCount(result.results.filter(row => row.state === "unavailable" || row.state === "cooldown").length);
      requestKey.current = null;
      setNotice(result.results.some(row => row.state === "cooldown") ? "Algumas fontes estão no intervalo de cinco minutos. As demais continuam separadamente." : "Solicitação recebida. Aguardando a confirmação de cada plataforma.");
      await status.refetch();
    },
    onError: () => { setNotice("Não foi possível confirmar a solicitação. Consulte o andamento antes de tentar novamente."); void status.refetch(); },
    onSettled: () => { locked.current = false; },
  });
  const data = status.data;
  const runs = data?.sources.map(source => source.latest_run).filter((run): run is MarketingRun => Boolean(run)) ?? [];
  const active = runs.some(run => activeMarketingRun(run));
  const uncertain = runs.some(run => run.overdue || run.status === "indeterminate");
  const now = data ? Date.parse(data.server_time) + Math.max(0, clock - status.dataUpdatedAt) : clock;
  const eligible = data?.sources.some(source => source.enabled && !activeMarketingRun(source.latest_run) && (!source.next_manual_at || Date.parse(source.next_manual_at) <= now));
  const currentRuns = (data?.requested_runs ?? []).filter(run => Object.values(requestedRuns).includes(run.id));
  const failed = currentRuns.filter(run => run.status === "failed").length + blockedCount;
  const succeeded = currentRuns.filter(run => run.status === "success").length;
  const label = mutation.isPending ? "Iniciando..." : uncertain ? "Verificação necessária" : active || Object.keys(watched).length > 0 ? "Sincronizando..." : failed && succeeded ? "Parcialmente concluído" : failed ? "Falhou" : mutation.isSuccess && succeeded ? "Concluído" : "Atualizar agora";
  const canRequest = data?.can_request === true && data.role === "admin" && !readOnly;
  const start = () => {
    if (locked.current || active || !canRequest || !eligible) return;
    locked.current = true; setNotice(""); setOpen(true); mutation.mutate();
  };
  return <div className="topbar-refresh data-sync-control">
    {canRequest && <button type="button" className="secondary-button data-sync-trigger" onClick={start}
      disabled={mutation.isPending || active || !eligible || status.isError || uncertain}
      aria-busy={mutation.isPending || active} title="Consultar as APIs de Meta Ads, Google Ads e GA4: sete dias anteriores mais hoje">
      <RefreshCw size={15} className={mutation.isPending || active && !uncertain ? "spin" : undefined} /><span>{label}</span>
    </button>}
    <button ref={anchor} type="button" className="icon-button" onClick={() => setOpen(value => !value)} aria-label="Ver atualização das fontes" aria-expanded={open} aria-haspopup="dialog" title="Andamento, último sucesso e cobertura por plataforma"><ChevronDown size={16} /></button>
    <span className="data-sync-live" role="status" aria-live="polite">{active ? "Coleta em andamento" : mutation.isSuccess ? label : ""}</span>
    <Popover open={open} onClose={close} anchorRef={anchor} label="Atualização das fontes" width={680}>
      <section className="data-sync-panel">
        <header><div><h2>Atualização das fontes</h2><p>Últimos sete dias completos mais hoje · horário de Brasília</p></div><button type="button" className="icon-button" onClick={close} aria-label="Fechar atualização"><X size={17} /></button></header>
        {status.isPending && <p role="status">Verificando seu acesso e as últimas execuções...</p>}
        {status.isError && <p role="alert">Não foi possível consultar as execuções. <button type="button" onClick={() => void status.refetch()}>Consultar novamente</button></p>}
        {data && <>
          {!canRequest && <p>Consulta disponível. Somente administradores podem iniciar coletas.</p>}
          <p className="data-sync-partial">Dados de hoje são parciais e podem sofrer atrasos e ajustes nas plataformas.</p>
          {range.end < data.today && <p className="data-sync-period">O período dos gráficos termina em {day(range.end)}. A coleta inclui hoje.</p>}
          {onShowToday && <button type="button" className="secondary-button" onClick={() => { onShowToday(data.today); close(); }}>Ver Hoje · parcial</button>}
          <div className="data-sync-sources" aria-live="polite">
            {data.sources.map(source => {
              const run = source.latest_run;
              return <article className={run?.status === "failed" || run?.overdue ? "has-error" : ""} key={source.source}>
                <strong>{sourceLabels[source.source]}</strong><span>{syncStateLabel(source)}</span>
                <dl><div><dt>Última coleta bem-sucedida</dt><dd>{time(source.last_success_at)}</dd></div><div><dt>Último dia com dados</dt><dd>{day(source.available_through)}{source.available_through === data.today ? " · parcial" : ""}</dd></div><div><dt>Última tentativa</dt><dd>{time(run?.started_at ?? run?.requested_at ?? null)}</dd></div></dl>
                {run && <small>Período: {day(run.range_start)} a {day(run.range_end)}{run.period_mode === "including_today" ? " · inclui dia parcial" : " · dias completos"}</small>}
                {run?.status === "failed" && <p>Falha da última tentativa. Os dados anteriores foram preservados.{run.error_code && <small> Código seguro: {run.error_code}</small>}</p>}
                {(run?.status === "indeterminate" || run?.overdue) && <p>Conclusão ainda não confirmada. A fonte permanece bloqueada para evitar execução simultânea.</p>}
                {source.missing_accounts > 0 && <small>Há conta sem dados persistidos.</small>}
                {source.next_manual_at && Date.parse(source.next_manual_at) > now && <small>Nova solicitação após {time(source.next_manual_at)}</small>}
              </article>;
            })}
          </div>
        </>}
        {notice && <p role="status">{notice}</p>}
      </section>
    </Popover>
  </div>;
}
