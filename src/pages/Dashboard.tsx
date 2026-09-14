import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import SiMeta from "@icons-pack/react-simple-icons/icons/SiMeta";
import { addDays, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { AlertCircle, BarChart3, ChartNoAxesCombined, CircleGauge, Layers3, MousePointerClick, PanelsTopLeft, Target, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnalyticsAcquisitionTable, AnalyticsEventsTable } from "../components/AnalyticsTables";
import { AnalyticsPerformanceChart, PerformanceHeroChart } from "../components/DashboardCharts";
import { DashboardShell } from "../components/DashboardShell";
import { DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { GoogleAdsLogo, GoogleAnalyticsLogo } from "../components/PlatformLogos";
import { getAnalyticsAcquisition, getAnalyticsEvents, getEntities, getOverview, getPmax } from "../lib/api";
import { brandLogoUrl } from "../lib/app-path";
import { compact, money, percent } from "../lib/format";
import type { AnalyticsKpis, CampaignScope, DashboardView, DateRange, EntityItem, Kpis, PmaxItem, Source } from "../types";

const initialEnd = addDays(new Date(), -1);
const initialRange: DateRange = {
  start: format(addDays(initialEnd, -6), "yyyy-MM-dd"),
  end: format(initialEnd, "yyyy-MM-dd"),
};

const TABLE_INITIAL_LIMIT = 10;
const validViews: DashboardView[] = ["overview", "google", "meta", "analytics"];
const validCampaignScopes: CampaignScope[] = ["all", "franchise", "condominium"];
const campaignScopeLabels: Record<CampaignScope, string> = {
  all: "Todos os dados",
  franchise: "Franquia",
  condominium: "Condomínios",
};

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view") as DashboardView | null;
  const view = requestedView && validViews.includes(requestedView) ? requestedView : "overview";
  const requestedCampaignScope = searchParams.get("campaign") as CampaignScope | null;
  const campaignScope = requestedCampaignScope && validCampaignScopes.includes(requestedCampaignScope) ? requestedCampaignScope : "all";
  const [range, setRange] = useState(initialRange);
  const [comparisonEnabled, setComparisonEnabled] = useState(true);
  const [showAllPmaxAssets, setShowAllPmaxAssets] = useState(false);
  const [showAllGoogleKeywords, setShowAllGoogleKeywords] = useState(false);
  const [showAllMetaAds, setShowAllMetaAds] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, campaignScope]);

  const previousRange = useMemo<DateRange>(() => {
    const days = differenceInCalendarDays(parseISO(range.end), parseISO(range.start)) + 1;
    const end = subDays(parseISO(range.start), 1);
    return { start: format(subDays(end, days - 1), "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
  }, [range]);

  const overview = useQuery({ queryKey: ["overview", range], queryFn: () => getOverview(range) });
  const googleCampaigns = useQuery({ queryKey: ["entities", "google_ads", "campaign", range], queryFn: () => getEntities("google_ads", "campaign", range), enabled: view === "google" || campaignScope !== "all" });
  const googleGroups = useQuery({ queryKey: ["entities", "google_ads", "group", range], queryFn: () => getEntities("google_ads", "group", range), enabled: view === "google" });
  const googleKeywords = useQuery({ queryKey: ["entities", "google_ads", "keyword", range], queryFn: () => getEntities("google_ads", "keyword", range), enabled: view === "google" });
  const metaCampaigns = useQuery({ queryKey: ["entities", "meta_ads", "campaign", range], queryFn: () => getEntities("meta_ads", "campaign", range), enabled: view === "meta" || campaignScope !== "all" });
  const metaGroups = useQuery({ queryKey: ["entities", "meta_ads", "group", range], queryFn: () => getEntities("meta_ads", "group", range), enabled: view === "meta" });
  const metaAds = useQuery({ queryKey: ["entities", "meta_ads", "ad", range], queryFn: () => getEntities("meta_ads", "ad", range), enabled: view === "meta" });
  const pmaxGroups = useQuery({ queryKey: ["pmax", "asset_group", range], queryFn: () => getPmax("asset_group", range), enabled: view === "google" });
  const pmaxAssets = useQuery({ queryKey: ["pmax", "asset", range], queryFn: () => getPmax("asset", range), enabled: view === "google" });
  const previousGoogleCampaigns = useQuery({
    queryKey: ["entities", "google_ads", "campaign", previousRange],
    queryFn: () => getEntities("google_ads", "campaign", previousRange),
    enabled: campaignScope !== "all" && comparisonEnabled,
  });
  const previousMetaCampaigns = useQuery({
    queryKey: ["entities", "meta_ads", "campaign", previousRange],
    queryFn: () => getEntities("meta_ads", "campaign", previousRange),
    enabled: campaignScope !== "all" && comparisonEnabled,
  });
  const analyticsAcquisition = useInfiniteQuery({
    queryKey: ["analytics-acquisition", range.start, range.end],
    initialPageParam: null as Record<string, string | number> | null,
    queryFn: ({ pageParam }) => getAnalyticsAcquisition(range, pageParam, TABLE_INITIAL_LIMIT),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: view === "analytics",
  });
  const analyticsEvents = useInfiniteQuery({
    queryKey: ["analytics-events", range.start, range.end],
    initialPageParam: null as Record<string, string | number> | null,
    queryFn: ({ pageParam }) => getAnalyticsEvents(range, pageParam, TABLE_INITIAL_LIMIT),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: view === "analytics",
  });

  const lastSync = useMemo(() => {
    const values = Object.values(overview.data?.last_sync ?? {}).map((item) => item.completed_at).filter(Boolean);
    return values.sort().at(-1);
  }, [overview.data]);

  const changeView = (nextView: DashboardView) => {
    const next = new URLSearchParams(searchParams);
    next.set("view", nextView);
    setSearchParams(next, { replace: true });
  };

  const changeCampaignScope = (nextScope: CampaignScope) => {
    const next = new URLSearchParams(searchParams);
    if (nextScope === "all") next.delete("campaign");
    else next.set("campaign", nextScope);
    setSearchParams(next, { replace: true });
    setShowAllPmaxAssets(false);
    setShowAllGoogleKeywords(false);
    setShowAllMetaAds(false);
  };

  if (overview.isLoading) return <DashboardLoading />;
  if (overview.isError || !overview.data) return <DashboardError message={(overview.error as Error)?.message} onRetry={() => void overview.refetch()} />;

  const data = overview.data;
  const googleCampaignItems = filterCampaignItems(googleCampaigns.data?.items ?? [], campaignScope);
  const metaCampaignItems = filterCampaignItems(metaCampaigns.data?.items ?? [], campaignScope);
  const hasScopedCurrentData = campaignScope !== "all" && Boolean(googleCampaigns.data && metaCampaigns.data);
  const hasScopedPreviousData = campaignScope !== "all" && Boolean(previousGoogleCampaigns.data && previousMetaCampaigns.data);
  const google = hasScopedCurrentData ? aggregateKpis(googleCampaignItems) : data.current.sources.google_ads;
  const meta = hasScopedCurrentData ? aggregateKpis(metaCampaignItems) : data.current.sources.meta_ads;
  const googlePrevious = hasScopedPreviousData
    ? aggregateKpis(filterCampaignItems(previousGoogleCampaigns.data?.items ?? [], campaignScope))
    : campaignScope === "all" ? data.previous.sources.google_ads : undefined;
  const metaPrevious = hasScopedPreviousData
    ? aggregateKpis(filterCampaignItems(previousMetaCampaigns.data?.items ?? [], campaignScope))
    : campaignScope === "all" ? data.previous.sources.meta_ads : undefined;
  const current = hasScopedCurrentData ? aggregateKpis([...googleCampaignItems, ...metaCampaignItems]) : data.current.consolidated;
  const previous = hasScopedPreviousData
    ? aggregateKpis([
      ...filterCampaignItems(previousGoogleCampaigns.data?.items ?? [], campaignScope),
      ...filterCampaignItems(previousMetaCampaigns.data?.items ?? [], campaignScope),
    ])
    : campaignScope === "all" ? data.previous.consolidated : emptyKpis();
  const analytics = data.analytics;

  const googleGroupItems = filterChildItems(googleGroups.data?.items ?? [], googleCampaignItems, campaignScope);
  const googleKeywordItems = filterChildItems(googleKeywords.data?.items ?? [], googleGroupItems, campaignScope);
  const visibleGoogleKeywords = showAllGoogleKeywords ? googleKeywordItems : googleKeywordItems.slice(0, TABLE_INITIAL_LIMIT);
  const remainingGoogleKeywords = Math.max(googleKeywordItems.length - TABLE_INITIAL_LIMIT, 0);
  const pmaxGroupItems = filterPmaxItems(pmaxGroups.data?.items ?? [], campaignScope);
  const pmaxAssetItems = filterPmaxItems(pmaxAssets.data?.items ?? [], campaignScope);
  const visiblePmaxAssets = showAllPmaxAssets ? pmaxAssetItems : pmaxAssetItems.slice(0, TABLE_INITIAL_LIMIT);
  const remainingPmaxAssets = Math.max(pmaxAssetItems.length - TABLE_INITIAL_LIMIT, 0);
  const metaGroupItems = filterChildItems(metaGroups.data?.items ?? [], metaCampaignItems, campaignScope);
  const metaAdItems = filterChildItems(metaAds.data?.items ?? [], metaGroupItems, campaignScope);
  const visibleMetaAds = showAllMetaAds ? metaAdItems : metaAdItems.slice(0, TABLE_INITIAL_LIMIT);
  const remainingMetaAds = Math.max(metaAdItems.length - TABLE_INITIAL_LIMIT, 0);
  const acquisitionItems = analyticsAcquisition.data?.pages.flatMap((page) => page.items) ?? [];
  const acquisitionTotal = analyticsAcquisition.data?.pages[0]?.total_count ?? 0;
  const eventItems = analyticsEvents.data?.pages.flatMap((page) => page.items) ?? [];
  const eventTotal = analyticsEvents.data?.pages[0]?.total_count ?? 0;

  const applyPeriod = (nextRange: DateRange, nextComparison: boolean) => {
    setRange(nextRange);
    setComparisonEnabled(nextComparison);
    setShowAllPmaxAssets(false);
    setShowAllGoogleKeywords(false);
    setShowAllMetaAds(false);
  };

  return (
    <DashboardShell
      range={range}
      comparisonEnabled={comparisonEnabled}
      onPeriodApply={applyPeriod}
      lastSync={lastSync}
      view={view}
      onViewChange={changeView}
      campaignScope={campaignScope}
      onCampaignScopeChange={changeCampaignScope}
    >
      {view === "overview" && (
        <OverviewView
          current={current}
          previous={previous}
          google={google}
          googlePrevious={googlePrevious}
          meta={meta}
          metaPrevious={metaPrevious}
          analytics={analytics?.current}
          daily={data.daily}
          onSelectView={changeView}
          campaignScope={campaignScope}
        />
      )}

      {view === "google" && google && (
        <ChannelView source="google_ads" current={google} previous={googlePrevious} daily={data.daily} campaignScope={campaignScope}>
          <DataSection title="Campanhas" description="Compare custo e volume para identificar as campanhas mais eficientes.">
            <DataPanel loading={googleCampaigns.isLoading} error={googleCampaigns.isError}>
              <DataTable items={googleCampaignItems} totalCount={googleCampaignItems.length} defaultSortKey="cost_per_result" defaultSortDirection="asc" />
            </DataPanel>
          </DataSection>
          <DataSection title="Grupos de anúncios" description="Desempenho dos grupos dentro de cada campanha.">
            <DataPanel loading={googleGroups.isLoading} error={googleGroups.isError}>
              <DataTable items={googleGroupItems} totalCount={googleGroupItems.length} defaultSortKey="results" />
            </DataPanel>
          </DataSection>
          <DataSection title="Palavras-chave" description="Termos com veiculação e seus principais indicadores.">
            <DataPanel loading={googleKeywords.isLoading} error={googleKeywords.isError}>
              <DataTable items={visibleGoogleKeywords} totalCount={googleKeywordItems.length} defaultSortKey="cost_per_result" defaultSortDirection="asc" />
              {googleKeywordItems.length > TABLE_INITIAL_LIMIT && <ExpandTableButton expanded={showAllGoogleKeywords} onClick={() => setShowAllGoogleKeywords((current) => !current)} expandLabel={`Ver mais ${remainingGoogleKeywords} palavras-chave`} collapseLabel={`Mostrar apenas as ${TABLE_INITIAL_LIMIT} principais`} />}
            </DataPanel>
          </DataSection>
          <DataSection title="Performance Max" description="Grupos de recursos e sinais atribuídos, sem duplicar os totais da campanha." icon={<BarChart3 size={20} />}>
            <div className="pmax-grid">
              <div className="nested-data-card">
                <PanelHeading icon={<Layers3 size={18} />} title="Grupos de recursos" count={pmaxGroupItems.length} />
                <DataPanel loading={pmaxGroups.isLoading} error={pmaxGroups.isError} embedded>
                  <DataTable kind="pmax" items={pmaxGroupItems} totalCount={pmaxGroupItems.length} defaultSortKey="results" />
                </DataPanel>
              </div>
              <div className="nested-data-card">
                <PanelHeading icon={<PanelsTopLeft size={18} />} title="Recursos individuais" count={pmaxAssetItems.length} />
                <DataPanel loading={pmaxAssets.isLoading} error={pmaxAssets.isError} embedded>
                  <DataTable kind="pmax" items={visiblePmaxAssets} totalCount={pmaxAssetItems.length} defaultSortKey="results" />
                  {pmaxAssetItems.length > TABLE_INITIAL_LIMIT && <ExpandTableButton expanded={showAllPmaxAssets} onClick={() => setShowAllPmaxAssets((current) => !current)} expandLabel={`Ver mais ${remainingPmaxAssets} recursos`} collapseLabel={`Mostrar apenas os ${TABLE_INITIAL_LIMIT} principais`} />}
                </DataPanel>
              </div>
            </div>
          </DataSection>
        </ChannelView>
      )}

      {view === "meta" && meta && (
        <ChannelView source="meta_ads" current={meta} previous={metaPrevious} daily={data.daily} campaignScope={campaignScope}>
          <DataSection title="Campanhas" description="Compare custo e volume entre as campanhas do período.">
            <DataPanel loading={metaCampaigns.isLoading} error={metaCampaigns.isError}>
              <DataTable items={metaCampaignItems} totalCount={metaCampaignItems.length} defaultSortKey="cost_per_result" defaultSortDirection="asc" />
            </DataPanel>
          </DataSection>
          <DataSection title="Conjuntos de anúncios" description="Públicos, segmentações e desempenho por conjunto.">
            <DataPanel loading={metaGroups.isLoading} error={metaGroups.isError}>
              <DataTable items={metaGroupItems} totalCount={metaGroupItems.length} defaultSortKey="results" />
            </DataPanel>
          </DataSection>
          <DataSection title="Anúncios" description="Criativos ordenáveis por eficiência, volume ou investimento.">
            <DataPanel loading={metaAds.isLoading} error={metaAds.isError}>
              <DataTable items={visibleMetaAds} totalCount={metaAdItems.length} defaultSortKey="cost_per_result" defaultSortDirection="asc" />
              {metaAdItems.length > TABLE_INITIAL_LIMIT && <ExpandTableButton expanded={showAllMetaAds} onClick={() => setShowAllMetaAds((current) => !current)} expandLabel={`Ver mais ${remainingMetaAds} anúncios`} collapseLabel={`Mostrar apenas os ${TABLE_INITIAL_LIMIT} principais`} />}
            </DataPanel>
          </DataSection>
        </ChannelView>
      )}

      {view === "analytics" && analytics && (
        <AnalyticsView current={analytics.current} previous={analytics.previous} daily={analytics.daily} campaignScope={campaignScope}>
          <DataSection title="Aquisição por origem/mídia" description="Canais que iniciaram sessões e registraram conversões no período.">
            <DataPanel loading={analyticsAcquisition.isLoading} error={analyticsAcquisition.isError && !analyticsAcquisition.data}>
              <AnalyticsAcquisitionTable items={acquisitionItems} totalCount={acquisitionTotal} />
              <LoadMoreButton visible={Boolean(analyticsAcquisition.hasNextPage)} loading={analyticsAcquisition.isFetchingNextPage} error={analyticsAcquisition.isFetchNextPageError} remaining={Math.max(acquisitionTotal - acquisitionItems.length, 0)} noun="origens" onClick={() => void analyticsAcquisition.fetchNextPage()} />
            </DataPanel>
          </DataSection>
          <DataSection title="Eventos do site" description="Interações registradas pelo Google Analytics no período selecionado.">
            <DataPanel loading={analyticsEvents.isLoading} error={analyticsEvents.isError && !analyticsEvents.data}>
              <AnalyticsEventsTable items={eventItems} totalCount={eventTotal} />
              <LoadMoreButton visible={Boolean(analyticsEvents.hasNextPage)} loading={analyticsEvents.isFetchingNextPage} error={analyticsEvents.isFetchNextPageError} remaining={Math.max(eventTotal - eventItems.length, 0)} noun="eventos" onClick={() => void analyticsEvents.fetchNextPage()} />
            </DataPanel>
          </DataSection>
        </AnalyticsView>
      )}
    </DashboardShell>
  );
}

function OverviewView({ current, previous, google, googlePrevious, meta, metaPrevious, analytics, daily, onSelectView, campaignScope }: {
  current: Kpis;
  previous: Kpis;
  google?: Kpis;
  googlePrevious?: Kpis;
  meta?: Kpis;
  metaPrevious?: Kpis;
  analytics?: AnalyticsKpis;
  daily: Parameters<typeof PerformanceHeroChart>[0]["daily"];
  onSelectView: (view: DashboardView) => void;
  campaignScope: CampaignScope;
}) {
  return <div className="dashboard-view overview-view">
    {campaignScope !== "all" && <CampaignScopeNotice scope={campaignScope} />}
    <div className="kpi-grid executive-kpis">
      <KpiCard label="Investimento" value={money(current.spend)} current={current.spend} previous={previous.spend} previousValue={money(previous.spend)} accent="red" icon={<WalletCards size={21} />} />
      <KpiCard label="Resultados de mídia" value={compact(current.results)} current={current.results} previous={previous.results} previousValue={compact(previous.results)} accent="gold" icon={<ChartNoAxesCombined size={21} />} />
      <KpiCard label="Custo por resultado" value={money(current.cost_per_result)} current={current.cost_per_result} previous={previous.cost_per_result} previousValue={money(previous.cost_per_result)} lowerIsBetter icon={<Target size={21} />} />
      <KpiCard label="CTR médio" value={percent(current.ctr)} current={current.ctr} previous={previous.ctr} previousValue={percent(previous.ctr)} icon={<MousePointerClick size={21} />} />
    </div>
    <PerformanceHeroChart daily={daily} />
    <ChannelStrip google={google} meta={meta} analytics={analytics} onSelectView={onSelectView} />
    <OverviewInsights google={google} googlePrevious={googlePrevious} meta={meta} metaPrevious={metaPrevious} />
  </div>;
}

function ChannelView({ source, current, previous, daily, campaignScope, children }: { source: Source; current: Kpis; previous?: Kpis; daily: Parameters<typeof PerformanceHeroChart>[0]["daily"]; campaignScope: CampaignScope; children: React.ReactNode }) {
  const isGoogle = source === "google_ads";
  return <div className="dashboard-view channel-view">
    <ViewHeading icon={isGoogle ? <GoogleAdsLogo size={34} /> : <SiMeta size={34} color="#1877f2" />} title={isGoogle ? "Google Ads" : "Meta Ads"} description="Performance do canal no período selecionado" />
    {campaignScope !== "all" && <CampaignScopeNotice scope={campaignScope} />}
    <div className="kpi-grid executive-kpis channel-kpis">
      <KpiCard label="Investimento" value={money(current.spend)} current={current.spend} previous={previous?.spend} previousValue={money(previous?.spend)} accent="red" icon={<WalletCards size={21} />} />
      <KpiCard label="Resultados" value={compact(current.results)} current={current.results} previous={previous?.results} previousValue={compact(previous?.results)} accent="gold" icon={<ChartNoAxesCombined size={21} />} />
      <KpiCard label="Custo por resultado" value={money(current.cost_per_result)} current={current.cost_per_result} previous={previous?.cost_per_result} previousValue={money(previous?.cost_per_result)} lowerIsBetter icon={<Target size={21} />} />
      <KpiCard label="CTR" value={percent(current.ctr)} current={current.ctr} previous={previous?.ctr} previousValue={percent(previous?.ctr)} icon={<MousePointerClick size={21} />} />
    </div>
    <PerformanceHeroChart daily={daily} source={source} />
    <div className="data-sections">{children}</div>
  </div>;
}

function AnalyticsView({ current, previous, daily, campaignScope, children }: { current: AnalyticsKpis; previous?: AnalyticsKpis; daily: Parameters<typeof AnalyticsPerformanceChart>[0]["daily"]; campaignScope: CampaignScope; children: React.ReactNode }) {
  const engagementRate = current.sessions ? current.engaged_sessions * 100 / current.sessions : null;
  const previousEngagementRate = previous?.sessions ? previous.engaged_sessions * 100 / previous.sessions : null;
  const conversionRate = current.sessions ? current.generate_leads * 100 / current.sessions : null;
  const previousConversionRate = previous?.sessions ? previous.generate_leads * 100 / previous.sessions : null;
  return <div className="dashboard-view channel-view analytics-view">
    <ViewHeading icon={<GoogleAnalyticsLogo size={36} />} title="Google Analytics" description="Aquisição e comportamento no site" />
    {campaignScope !== "all" && <div className="scope-context-note"><AlertCircle size={17} /><span>O filtro <strong>{campaignScopeLabels[campaignScope]}</strong> organiza Google Ads e Meta Ads. O GA4 permanece integral porque o contrato atual não informa a campanha nessas métricas.</span></div>}
    <div className="kpi-grid executive-kpis analytics-kpis">
      <KpiCard label="Sessões" value={compact(current.sessions)} current={current.sessions} previous={previous?.sessions} previousValue={compact(previous?.sessions)} accent="red" icon={<BarChart3 size={21} />} />
      <KpiCard label="Taxa de engajamento" value={percent(engagementRate)} current={engagementRate} previous={previousEngagementRate} previousValue={percent(previousEngagementRate)} accent="gold" icon={<CircleGauge size={21} />} />
      <KpiCard label="Usuários ativos" value={compact(current.active_users)} current={current.active_users} previous={previous?.active_users} previousValue={compact(previous?.active_users)} icon={<ChartNoAxesCombined size={21} />} />
      <KpiCard label="Visualizações" value={compact(current.views)} current={current.views} previous={previous?.views} previousValue={compact(previous?.views)} icon={<PanelsTopLeft size={21} />} />
      <KpiCard label="Conversões (form_submit)" value={compact(current.generate_leads)} current={current.generate_leads} previous={previous?.generate_leads} previousValue={compact(previous?.generate_leads)} accent="gold" icon={<Target size={21} />} />
      <KpiCard label="Taxa de conversão" value={percent(conversionRate)} current={conversionRate} previous={previousConversionRate} previousValue={percent(previousConversionRate)} accent="red" icon={<MousePointerClick size={21} />} />
    </div>
    {current.generate_leads === 0 && <div className="info-banner analytics-warning"><AlertCircle size={17} /><span>Nenhum evento form_submit registrado no período.</span></div>}
    <AnalyticsPerformanceChart daily={daily} />
    <div className="data-sections">{children}</div>
  </div>;
}

function ViewHeading({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="view-heading"><span>{icon}</span><div><h1>{title}</h1><p>{description}</p></div></div>;
}

function CampaignScopeNotice({ scope }: { scope: Exclude<CampaignScope, "all"> }) {
  return <div className="scope-context-note"><AlertCircle size={17} /><span>Filtro <strong>{campaignScopeLabels[scope]}</strong> aplicado aos KPIs e tabelas de mídia. A evolução diária permanece consolidada porque os dados atuais não trazem campanha nessa série.</span></div>;
}

function ChannelStrip({ google, meta, analytics, onSelectView }: { google?: Kpis; meta?: Kpis; analytics?: AnalyticsKpis; onSelectView: (view: DashboardView) => void }) {
  return <div className="channel-strip">
    <button type="button" onClick={() => onSelectView("google")}>
      <span className="channel-logo"><GoogleAdsLogo size={34} /></span>
      <span><strong>Google Ads</strong><b>{compact(google?.results)} <small>resultados</small></b></span>
      <span className="channel-secondary"><b>{money(google?.cost_per_result)}</b><small>custo por resultado</small></span>
    </button>
    <button type="button" onClick={() => onSelectView("meta")}>
      <span className="channel-logo"><SiMeta size={35} color="#1877f2" /></span>
      <span><strong>Meta Ads</strong><b>{compact(meta?.results)} <small>resultados</small></b></span>
      <span className="channel-secondary"><b>{money(meta?.cost_per_result)}</b><small>custo por resultado</small></span>
    </button>
    <button type="button" onClick={() => onSelectView("analytics")}>
      <span className="channel-logo"><GoogleAnalyticsLogo size={35} /></span>
      <span><strong>Google Analytics</strong><b>{compact(analytics?.sessions)} <small>sessões</small></b></span>
      <span className="channel-secondary"><b>{compact(analytics?.generate_leads)}</b><small>formulários</small></span>
    </button>
  </div>;
}

function OverviewInsights({ google, googlePrevious, meta, metaPrevious }: { google?: Kpis; googlePrevious?: Kpis; meta?: Kpis; metaPrevious?: Kpis }) {
  const totalSpend = (google?.spend ?? 0) + (meta?.spend ?? 0);
  const googleShare = totalSpend ? ((google?.spend ?? 0) * 100) / totalSpend : 0;
  const metaShare = totalSpend ? ((meta?.spend ?? 0) * 100) / totalSpend : 0;
  const maxCost = Math.max(google?.cost_per_result ?? 0, meta?.cost_per_result ?? 0, 1);
  const maxResults = Math.max(google?.results ?? 0, meta?.results ?? 0, 1);
  const best = (google?.cost_per_result ?? Infinity) <= (meta?.cost_per_result ?? Infinity) ? "Google Ads" : "Meta Ads";
  const bestCost = Math.min(google?.cost_per_result ?? Infinity, meta?.cost_per_result ?? Infinity);
  const otherCost = Math.max(google?.cost_per_result ?? 0, meta?.cost_per_result ?? 0);
  const advantage = Number.isFinite(bestCost) && otherCost ? ((otherCost - bestCost) * 100) / otherCost : null;
  const totalResults = (google?.results ?? 0) + (meta?.results ?? 0);
  const previousResults = (googlePrevious?.results ?? 0) + (metaPrevious?.results ?? 0);
  const resultChange = previousResults ? ((totalResults - previousResults) * 100) / previousResults : null;

  return <div className="overview-insights">
    <article className="insight-card investment-card">
      <div className="insight-title"><h3>Distribuição do investimento</h3><span>realizado</span></div>
      <div className="investment-content">
        <div className="donut" style={{ background: `conic-gradient(#9d2a1e 0 ${googleShare}%, #d7982b ${googleShare}% 100%)` }}><span><strong>{money(totalSpend)}</strong><small>investimento total</small></span></div>
        <div className="investment-legend">
          <div><i className="google-dot" /><span><small>Google Ads</small><strong>{Math.round(googleShare)}%</strong><b>{money(google?.spend)}</b></span></div>
          <div><i className="meta-dot" /><span><small>Meta Ads</small><strong>{Math.round(metaShare)}%</strong><b>{money(meta?.spend)}</b></span></div>
        </div>
      </div>
    </article>
    <article className="insight-card efficiency-card">
      <div className="insight-title"><h3>Eficiência por canal</h3><span>menor custo é melhor</span></div>
      <MetricBar label="Google Ads" value={google?.cost_per_result} width={((google?.cost_per_result ?? 0) * 100) / maxCost} color="red" />
      <MetricBar label="Meta Ads" value={meta?.cost_per_result} width={((meta?.cost_per_result ?? 0) * 100) / maxCost} color="gold" />
      <p className="insight-note"><CircleGauge size={18} /><span><strong>{best}</strong>{advantage != null ? ` apresenta custo por resultado ${percent(advantage)} menor.` : " lidera em eficiência no período."}</span></p>
    </article>
    <article className="insight-card volume-card">
      <div className="insight-title"><h3>Volume de resultados</h3><span>{resultChange == null ? "período atual" : `${resultChange >= 0 ? "+" : ""}${percent(resultChange)} vs. anterior`}</span></div>
      <div className="volume-bars">
        <VolumeBar label="Google Ads" value={google?.results ?? 0} height={((google?.results ?? 0) * 100) / maxResults} color="red" />
        <VolumeBar label="Meta Ads" value={meta?.results ?? 0} height={((meta?.results ?? 0) * 100) / maxResults} color="gold" />
      </div>
    </article>
  </div>;
}

function MetricBar({ label, value, width, color }: { label: string; value?: number | null; width: number; color: "red" | "gold" }) {
  return <div className="metric-bar"><span>{label}</span><div><i className={color} style={{ width: `${width}%` }} /></div><strong>{money(value)}</strong></div>;
}

function VolumeBar({ label, value, height, color }: { label: string; value: number; height: number; color: "red" | "gold" }) {
  return <div className="volume-column"><strong>{compact(value)}</strong><div><i className={color} style={{ height: `${height}%` }} /></div><span>{label}</span></div>;
}

function DataSection({ title, description, icon, children }: { title: string; description: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section className="data-section"><div className="data-section-head">{icon && <span>{icon}</span>}<div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>;
}

function ExpandTableButton({ expanded, onClick, expandLabel, collapseLabel }: { expanded: boolean; onClick: () => void; expandLabel: string; collapseLabel: string }) {
  return <div className="table-show-more"><button type="button" className="secondary-button" aria-expanded={expanded} onClick={onClick}>{expanded ? collapseLabel : expandLabel}</button></div>;
}

function LoadMoreButton({ visible, loading, error, remaining, noun, onClick }: { visible: boolean; loading: boolean; error: boolean; remaining: number; noun: string; onClick: () => void }) {
  if (!visible && !error) return null;
  return <div className={`table-show-more ${error ? "pagination-error" : ""}`}>
    {error && <span>Não foi possível carregar a próxima página.</span>}
    <button type="button" className="secondary-button" disabled={loading} onClick={onClick}>{loading ? "Carregando..." : error ? "Tentar carregar mais" : `Ver mais ${Math.min(remaining, TABLE_INITIAL_LIMIT)} ${noun}`}</button>
  </div>;
}

function PanelHeading({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return <div className="panel-heading"><span>{icon}</span><h3>{title}</h3>{typeof count === "number" && <small>{count}</small>}</div>;
}

function DataPanel({ children, loading, error, embedded = false }: { children: React.ReactNode; loading?: boolean; error?: boolean; embedded?: boolean }) {
  if (loading) return <div className={embedded ? "table-loading embedded" : "table-loading"}>{Array.from({ length: 5 }).map((_, index) => <span key={index} />)}</div>;
  if (error) return <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar esta seção.</div>;
  return <>{children}</>;
}

function normalizeCampaignName(value?: string | null) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function matchesCampaignScope(value: string | null | undefined, scope: CampaignScope) {
  if (scope === "all") return true;
  const normalized = normalizeCampaignName(value);
  return scope === "franchise"
    ? normalized.includes("franquia") || normalized.includes("franquead")
    : normalized.includes("condomin");
}

function filterCampaignItems(items: EntityItem[], scope: CampaignScope) {
  return scope === "all" ? [...items] : items.filter((item) => matchesCampaignScope(item.item_name, scope));
}

function filterChildItems(items: EntityItem[], filteredParents: EntityItem[], scope: CampaignScope) {
  if (scope === "all") return [...items];
  const parentIds = new Set(filteredParents.map((item) => item.item_id));
  const parentNames = new Set(filteredParents.map((item) => normalizeCampaignName(item.item_name)));
  return items.filter((item) => {
    const parentName = normalizeCampaignName(item.parent_name);
    return matchesCampaignScope(item.item_name, scope)
      || matchesCampaignScope(item.parent_name, scope)
      || Boolean(item.parent_id && parentIds.has(item.parent_id))
      || parentNames.has(parentName);
  });
}

function filterPmaxItems(items: PmaxItem[], scope: CampaignScope) {
  return scope === "all" ? [...items] : items.filter((item) => matchesCampaignScope(item.campaign_name, scope));
}

function emptyKpis(): Kpis {
  return { has_data: false, spend: 0, impressions: 0, clicks: 0, results: 0, ctr: null, cpc: null, cpm: null, cost_per_result: null };
}

function aggregateKpis(items: Kpis[]): Kpis {
  if (!items.length) return emptyKpis();
  const totals = items.reduce((result, item) => ({
    spend: result.spend + item.spend,
    impressions: result.impressions + item.impressions,
    reach: result.reach + (item.reach ?? 0),
    clicks: result.clicks + item.clicks,
    linkClicks: result.linkClicks + (item.link_clicks ?? 0),
    results: result.results + item.results,
    allConversions: result.allConversions + (item.all_conversions ?? 0),
    conversionValue: result.conversionValue + (item.conversion_value ?? 0),
  }), { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, results: 0, allConversions: 0, conversionValue: 0 });

  return {
    has_data: true,
    spend: totals.spend,
    impressions: totals.impressions,
    reach: totals.reach,
    clicks: totals.clicks,
    link_clicks: totals.linkClicks,
    results: totals.results,
    all_conversions: totals.allConversions,
    conversion_value: totals.conversionValue,
    ctr: totals.impressions ? totals.clicks * 100 / totals.impressions : null,
    link_ctr: totals.impressions ? totals.linkClicks * 100 / totals.impressions : null,
    cpc: totals.clicks ? totals.spend / totals.clicks : null,
    link_cpc: totals.linkClicks ? totals.spend / totals.linkClicks : null,
    cpm: totals.impressions ? totals.spend * 1000 / totals.impressions : null,
    cost_per_result: totals.results ? totals.spend / totals.results : null,
  };
}

function DashboardLoading() {
  return <div className="screen-state"><img src={brandLogoUrl} alt="Maria Gasolina" /><div className="spinner" /><p>Carregando seu relatório...</p></div>;
}

function DashboardError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return <div className="screen-state error"><AlertCircle size={30} /><h1>Não foi possível abrir o relatório</h1><p>{message ?? "Tente novamente em alguns instantes."}</p><button className="primary-button" onClick={onRetry}>Tentar novamente</button></div>;
}
