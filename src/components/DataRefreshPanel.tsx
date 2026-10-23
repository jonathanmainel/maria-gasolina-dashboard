import { RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { isDemoMode } from "../lib/api";
import { getSourceFreshness, reloadDashboardData } from "../lib/data-refresh";
import { dateTime } from "../lib/format";
import type { DateRange } from "../types";

const names = { meta_ads: "Meta Ads", google_ads: "Google Ads", ga4: "GA4" };
const date = (value: string) => value.split("-").reverse().join("/");
export function DataRefreshPanel({ range }: { range: DateRange }) {
  const client = useQueryClient();
  const freshness = useQuery({ queryKey: ["source-freshness"], queryFn: getSourceFreshness, staleTime: 60_000, retry: 1 });
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const reload = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice("");
    try {
      await reloadDashboardData(client);
      setNotice("Consultas recarregadas. As datas de coleta de cada plataforma estão abaixo.");
    } catch {
      setNotice("Não foi possível recarregar todos os dados. Confira sua conexão e tente novamente; os valores anteriores foram mantidos.");
    } finally { locked.current = false; setBusy(false); }
  };
  return <section className="data-refresh" aria-label="Atualização dos dados de marketing">
    <div className="data-refresh-action">
      <button type="button" className="secondary-button" onClick={() => void reload()} disabled={busy} aria-busy={busy} aria-describedby="data-refresh-description">
        <RefreshCw size={16} className={busy ? "spin" : undefined} />{busy ? "Recarregando…" : "Recarregar dados"}
      </button>
      <p id="data-refresh-description">{isDemoMode ? "Modo demonstração. Recarrega somente os exemplos identificados." : "Consulta novamente os dados existentes no Supabase. Não inicia uma nova coleta nas APIs."}</p>
    </div>
    <div className="data-refresh-sources" aria-label="Última sincronização por plataforma">
      {isDemoMode ? <p>Datas reais de sincronização indisponíveis no modo demonstração.</p> : freshness.isLoading ? <p>Consultando datas das plataformas…</p> : freshness.isError ? <p role="status">Datas de sincronização indisponíveis. Os indicadores têm carregamento independente.</p> : freshness.data?.map(item => <div className="data-refresh-source" key={item.source}>
        <strong>{names[item.source]}</strong>
        <span>Último sucesso: {item.completedAt ? dateTime(item.completedAt) : "Não registrado"}</span>
        <span>Dados até: {item.latestDate ? date(item.latestDate) : "Indisponível"}</span>
        {item.latestDate && item.latestDate < range.end && <small>{item.latestDate < range.start ? "Sem dados no período selecionado" : "Cobertura parcial do período selecionado"}</small>}
      </div>)}
    </div>
    {notice && <p className="data-refresh-notice" role="status">{notice}</p>}
  </section>;
}
