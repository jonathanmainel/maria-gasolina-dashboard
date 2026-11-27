import { AlertCircle, Eye } from "lucide-react";
import { comparisonPeriod, initialReportingRange, monthToDate, type PeriodPreset } from "../lib/reporting-period";
import { useReportingToday } from "../lib/use-reporting-today";
import { useIntradaySync } from "../lib/use-intraday-sync";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Skeleton } from "../components/ui/primitives";
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

const validViews: AppView[] = ["executive", ...Object.values(commercialFronts).map((front) => front.view), "organic", "site", "retaguarda", "crm", "settings"];
const RetaguardaView = lazy(() => import("../views/Retaguarda").then(({ RetaguardaView }) => ({ default: RetaguardaView })));

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("view") as AppView | null;
  const view: AppView = requested && validViews.includes(requested) ? requested : "executive";
  const readOnly = searchParams.get("share") === "1";
  const presenting = searchParams.get("present") === "1";
  const today = useReportingToday();
  const [fixedRange, setFixedRange] = useState<DateRange>(initialReportingRange);
  const [preset, setPreset] = useState<PeriodPreset>("mtd");
  const range = useMemo(() => preset === "mtd" ? monthToDate(today) : fixedRange, [preset, today, fixedRange]);
  const { previous, currentDays, previousDays } = useMemo(() => comparisonPeriod(range, preset), [range, preset]);
  const includesToday = range.start <= today && range.end >= today;
  useIntradaySync(presenting ? "presentation" : view, today);
  const [comparisonEnabled, setComparisonEnabled] = useState(true);
  const [salesFront, setSalesFront] = useState<CommercialFront>("franchise");
  const [commercialPreview, setCommercialPreview] = useState(false);
  useEffect(() => { if (view !== "crm") setCommercialPreview(false); }, [view]);
  const [organicScope, setOrganicScope] = useState<OrganicScope>("overview");
  const data = useDashboard(range, presenting || view !== "retaguarda", previous);

  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); if (value == null) next.delete(key); else next.set(key, value); return next; }, { replace: true });
  }, [setSearchParams]);
  const onViewChange = (v: AppView) => { setParam("view", v); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const onPresent = () => setParam("present", "1");
  const onExitPresent = useCallback(() => setParam("present", null), [setParam]);
  const shareUrl = useMemo(() => { const u = new URL(window.location.href); u.searchParams.set("share", "1"); u.searchParams.delete("present"); u.searchParams.delete("view"); return u.toString(); }, []);
  const onShare = () => onViewChange("settings");
  useEffect(() => { document.title = presenting ? "Maria Gasolina | Apresentação" : "Maria Gasolina | Performance Center"; }, [presenting]);
  const viewState = (view === "settings" && !readOnly ? data.sourceStates?.settings : view === "organic" ? data.sourceStates?.organic : null) ?? data;
  const errorTitle = view === "settings" ? "Não foi possível carregar as configurações" : view === "organic" ? "Não foi possível carregar os dados orgânicos" : "Não foi possível carregar os dados";

  const periodNote = [
    comparisonEnabled && preset === "mtd" && "Comparação com o mesmo intervalo do mês anterior.",
    includesToday && (comparisonEnabled
      ? "Hoje é parcial e pode sofrer alterações. A referência histórica usa dias completos."
      : "Hoje é parcial e pode sofrer alterações."),
    comparisonEnabled && currentDays !== previousDays && `Duração dos períodos: ${currentDays} e ${previousDays} dias.`,
  ].filter(Boolean).join(" ");

  if (presenting) {
    if (data.isLoading) return <div className="screen-state"><div className="spinner" /><p>Preparando a apresentação...</p></div>;
    return <div className={comparisonEnabled ? "" : "comparison-hidden"}><Presentation periodNote={periodNote} data={data} range={range} onExit={onExitPresent} commercialDemo={commercialPreview} onCommercialDemoChange={setCommercialPreview} salesFront={salesFront} onSalesFrontChange={setSalesFront} /></div>;
  }

  return (
    <div className={comparisonEnabled ? "" : "comparison-hidden"}>
      <Shell view={view} onViewChange={onViewChange} range={range} reportingDay={today} preset={preset} comparisonEnabled={comparisonEnabled} onPeriodApply={(r, c, mode) => { setFixedRange(r); setPreset(mode); setComparisonEnabled(c); }} readOnly={readOnly} onPresent={onPresent} onShare={onShare}>
        {periodNote && <div className="intraday-banner" role="note">{periodNote}</div>}
        {readOnly && <div className="readonly-banner"><Eye size={16} />Você está vendo uma versão somente leitura compartilhada pela GT+. Metas e configurações ficam ocultas.</div>}
        {/* Site trata suas consultas separadamente. Place mantém sua composição
            montada durante a atualização para preservar o modo comparativo;
            FrontView apresenta os mesmos estados de carregamento/erro. */}
        {view === "site" ? (
          <SiteView range={range} previousRange={previous} />
        ) : view === "retaguarda" ? (
          <Suspense fallback={<div role="status" aria-label="Carregando Retaguarda"><Skeleton height={200} /></div>}>
            <RetaguardaView range={range} readOnly={readOnly} />
          </Suspense>
        ) : view === "crm" ? (
          <CrmView data={data} range={range} readOnly={readOnly} preview={commercialPreview} onPreviewChange={setCommercialPreview} selectedFront={salesFront} onFrontChange={setSalesFront} />
        ) : isPlaceFront(view) ? (
          <FrontView key={view} front={view} data={data} range={range} onNavigate={onViewChange} />
        ) : viewState.isError ? (
          <div className="screen-state error" role="alert" style={{ minHeight: "60vh" }}><AlertCircle size={30} /><h1>{errorTitle}</h1><p>{viewState.error?.message ?? "Tente novamente em alguns instantes."}</p><button type="button" className="primary-button" onClick={() => void viewState.refetch()}>Tentar novamente</button></div>
        ) : viewState.isLoading ? (
          <div className="grid grid-4" role="status" aria-busy="true" aria-label={view === "settings" ? "Carregando configurações" : view === "organic" ? "Carregando dados orgânicos" : "Carregando dados do dashboard"}><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={420} className="span-2" /><Skeleton height={420} className="span-2" /></div>
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
