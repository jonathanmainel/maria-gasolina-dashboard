import { AlertCircle, Eye } from "lucide-react";
import { initialReportingRange, reportingToday } from "../lib/reporting-period";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Skeleton } from "../components/ui/primitives";
import { getLastSync } from "../lib/api";
import { useDashboard } from "../lib/use-dashboard";
import { commercialFronts, isPlaceFront } from "../lib/fronts";
import type { AppView, CommercialFront, DateRange } from "../types";
import { CrmView } from "../views/Crm";
import { ExecutiveView } from "../views/Executive";
import { FrontView } from "../views/FrontView";
import { OrganicView, type OrganicScope } from "../views/Organic";
import { Presentation } from "../views/Presentation";
import { SettingsView } from "../views/Settings";
import { SiteView } from "../views/SiteView";

const validViews: AppView[] = ["executive", ...Object.values(commercialFronts).map((front) => front.view), "organic", "site", "crm", "settings"];

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("view") as AppView | null;
  const view: AppView = requested && validViews.includes(requested) ? requested : "executive";
  const readOnly = searchParams.get("share") === "1";
  const presenting = searchParams.get("present") === "1";
  const [range, setRange] = useState<DateRange>(() => initialReportingRange());
  const [comparisonEnabled, setComparisonEnabled] = useState(true);
  const [salesFront, setSalesFront] = useState<CommercialFront>("franchise");
  const [commercialPreview, setCommercialPreview] = useState(false);
  useEffect(() => { if (view !== "crm") setCommercialPreview(false); }, [view]);
  const [organicScope, setOrganicScope] = useState<OrganicScope>("overview");
  const data = useDashboard(range);

  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); if (value == null) next.delete(key); else next.set(key, value); return next; }, { replace: true });
  }, [setSearchParams]);
  const onViewChange = (v: AppView) => { setParam("view", v); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const onPresent = () => setParam("present", "1");
  const onExitPresent = useCallback(() => setParam("present", null), [setParam]);
  const shareUrl = useMemo(() => { const u = new URL(window.location.href); u.searchParams.set("share", "1"); u.searchParams.delete("present"); u.searchParams.delete("view"); return u.toString(); }, []);
  const onShare = () => onViewChange("settings");
  useEffect(() => { document.title = presenting ? "Maria Gasolina | Apresentação" : "Maria Gasolina | Performance Center"; }, [presenting]);
  const lastSync = useQuery({ queryKey: ["last-sync"], queryFn: getLastSync, retry: 1, staleTime: 5 * 60_000 });

  if (presenting) {
    if (data.isLoading) return <div className="screen-state"><div className="spinner" /><p>Preparando a apresentação...</p></div>;
    return <Presentation data={data} range={range} onExit={onExitPresent} commercialDemo={commercialPreview} onCommercialDemoChange={setCommercialPreview} salesFront={salesFront} onSalesFrontChange={setSalesFront} />;
  }

  return (
    <div className={comparisonEnabled ? "" : "comparison-hidden"}>
      <Shell view={view} onViewChange={onViewChange} range={range} comparisonEnabled={comparisonEnabled} onPeriodApply={(r, c) => { setRange(r); setComparisonEnabled(c); }} lastSync={lastSync.data ?? undefined} readOnly={readOnly} onPresent={onPresent} onShare={onShare}>
        {range.start <= reportingToday() && range.end >= reportingToday() && <div className="intraday-banner" role="note">Hoje � dados parciais. As plataformas podem atualizar m�tricas com atraso; estes n�meros ainda n�o representam o fechamento do dia.</div>}
        {readOnly && <div className="readonly-banner"><Eye size={16} />Você está vendo uma versão somente leitura compartilhada pela GT+. Metas e configurações ficam ocultas.</div>}
        {/* Site trata suas consultas separadamente. Place mantém sua composição
            montada durante a atualização para preservar o modo comparativo;
            FrontView apresenta os mesmos estados de carregamento/erro. */}
        {view === "site" ? (
          <SiteView range={range} />
        ) : view === "crm" ? (
          <CrmView data={data} range={range} readOnly={readOnly} preview={commercialPreview} onPreviewChange={setCommercialPreview} selectedFront={salesFront} onFrontChange={setSalesFront} />
        ) : isPlaceFront(view) ? (
          <FrontView key={view} front={view} data={data} range={range} onNavigate={onViewChange} />
        ) : data.isError ? (
          <div className="screen-state error" style={{ minHeight: "60vh" }}><AlertCircle size={30} /><h1>Não foi possível carregar os dados</h1><p>{data.error?.message ?? "Tente novamente em alguns instantes."}</p><button type="button" className="primary-button" onClick={data.refetch}>Tentar novamente</button></div>
        ) : data.isLoading ? (
          <div className="grid grid-4"><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={420} className="span-2" /><Skeleton height={420} className="span-2" /></div>
        ) : (
          <>
            {view === "executive" && <ExecutiveView data={data} range={range} onNavigate={onViewChange} />}
            {view === "franchise" && <FrontView front="franchise" data={data} range={range} onNavigate={onViewChange} />}
            {view === "organic" && <OrganicView data={data} scope={organicScope} onScopeChange={setOrganicScope} />}
            {view === "settings" && !readOnly && <SettingsView shareUrl={shareUrl} onPresent={onPresent} access={data.commercial?.access} />}
          </>
        )}
      </Shell>
    </div>
  );
}
