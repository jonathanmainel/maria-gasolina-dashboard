import { RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { isDemoMode } from "../lib/api";
import { getSourceFreshness, reloadDashboardData } from "../lib/data-refresh";
import { dateTime } from "../lib/format";
import type { DateRange } from "../types";

const names = { meta_ads: "Meta Ads", google_ads: "Google Ads", ga4: "GA4" };
const date = (value: string) => value.split("-").reverse().join("/");

/** Compact, read-only refresh next to the global "Atualizado" status. */
export function DataRefreshPanel({ range }: { range: DateRange }) {
  const client = useQueryClient();
  const freshness = useQuery({ queryKey: ["source-freshness"], queryFn: getSourceFreshness, staleTime: 60_000, retry: 1 });
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [consultedAt, setConsultedAt] = useState<Date | null>(null);

  const sourceStatus = isDemoMode
    ? "Modo demonstração: os dados são ilustrativos."
    : freshness.isLoading
    ? "Consultando datas de sincronização..."
    : freshness.isError
    ? "Datas por plataforma indisponíveis."
    : freshness.data?.map(({ source, completedAt, latestDate }) => {
      const coverage = latestDate ? `dados até ${date(latestDate)}` : "sem data de cobertura";
      const gap = latestDate && latestDate < range.end ? " (período incompleto)" : "";
      return `${names[source]}: ${coverage}${gap}; último sucesso: ${completedAt ? dateTime(completedAt) : "não registrado"}`;
    }).join("\n") ?? "Sem informações de sincronização.";

  const reload = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      await reloadDashboardData(client);
      setConsultedAt(new Date());
    } catch {
      setNotice("Falha ao recarregar os dados. Os valores anteriores foram preservados.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return <div className="topbar-refresh">
    <button
      type="button"
      className="icon-button topbar-refresh-button"
      onClick={() => void reload()}
      disabled={busy}
      aria-busy={busy}
      aria-label="Recarregar dados"
      title={`Recarregar dados existentes no Supabase (não inicia coleta nas APIs).\n${sourceStatus}`}
    >
      <RefreshCw size={16} className={busy ? "spin" : undefined} />
    </button>
    <span className={`topbar-query-status${notice ? " query-error" : ""}`} role="status" aria-live="polite" title={notice || sourceStatus}>
      {notice ? "Falha na consulta" : consultedAt ? `Consulta atualizada às ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(consultedAt)}` : ""}
    </span>
  </div>;
}
