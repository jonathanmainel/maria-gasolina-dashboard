import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { AlertCircle, BarChart3, ChevronRight, Layers3, Megaphone, MousePointerClick, PanelsTopLeft, Target, WalletCards } from "lucide-react";
import SiMeta from "@icons-pack/react-simple-icons/icons/SiMeta";
import { useMemo, useState } from "react";
import { DashboardCharts } from "../components/DashboardCharts";
import { DashboardShell } from "../components/DashboardShell";
import { GoogleAdsLogo } from "../components/PlatformLogos";
import { DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { getEntities, getOverview, getPmax } from "../lib/api";
import { brandLogoUrl } from "../lib/app-path";
import { compact, money, percent } from "../lib/format";
import type { DateRange, Kpis, Source } from "../types";

const initialEnd = addDays(new Date(), -1);
const initialRange: DateRange = {
  start: format(addDays(initialEnd, -6), "yyyy-MM-dd"),
  end: format(initialEnd, "yyyy-MM-dd"),
};

export function DashboardPage() {
  const [range, setRange] = useState(initialRange);
  const overview = useQuery({ queryKey: ["overview", range], queryFn: () => getOverview(range) });
  const googleCampaigns = useQuery({ queryKey: ["entities", "google_ads", "campaign", range], queryFn: () => getEntities("google_ads", "campaign", range) });
  const googleGroups = useQuery({ queryKey: ["entities", "google_ads", "group", range], queryFn: () => getEntities("google_ads", "group", range) });
  const metaCampaigns = useQuery({ queryKey: ["entities", "meta_ads", "campaign", range], queryFn: () => getEntities("meta_ads", "campaign", range) });
  const metaGroups = useQuery({ queryKey: ["entities", "meta_ads", "group", range], queryFn: () => getEntities("meta_ads", "group", range) });
  const metaAds = useQuery({ queryKey: ["entities", "meta_ads", "ad", range], queryFn: () => getEntities("meta_ads", "ad", range) });
  const pmaxGroups = useQuery({ queryKey: ["pmax", "asset_group", range], queryFn: () => getPmax("asset_group", range) });
  const pmaxAssets = useQuery({ queryKey: ["pmax", "asset", range], queryFn: () => getPmax("asset", range) });

  const lastSync = useMemo(() => {
    const values = Object.values(overview.data?.last_sync ?? {}).map((item) => item.completed_at).filter(Boolean);
    return values.sort().at(-1);
  }, [overview.data]);

  if (overview.isLoading) return <DashboardLoading />;
  if (overview.isError || !overview.data) return <DashboardError message={(overview.error as Error)?.message} onRetry={() => void overview.refetch()} />;

  const data = overview.data;
  const current = data.current.consolidated;
  const previous = data.previous.consolidated;
  const google = data.current.sources.google_ads;
  const googlePrevious = data.previous.sources.google_ads;
  const meta = data.current.sources.meta_ads;
  const metaPrevious = data.previous.sources.meta_ads;

  return (
    <DashboardShell range={range} onRangeChange={setRange} lastSync={lastSync}>
      <section id="resumo" className="dashboard-section first-section">
        <SectionTitle eyebrow="Visão geral" title="Resumo consolidado" description="Google Ads e Meta Ads no período selecionado" />
        <div className="kpi-grid summary-grid">
          <KpiCard label="Investimento" value={money(current.spend)} current={current.spend} previous={previous.spend} previousValue={money(previous.spend)} accent="red" />
          <KpiCard label="Impressões" value={compact(current.impressions)} current={current.impressions} previous={previous.impressions} previousValue={compact(previous.impressions)} />
          <KpiCard label="Cliques" value={compact(current.clicks)} current={current.clicks} previous={previous.clicks} previousValue={compact(previous.clicks)} />
          <KpiCard label="Resultados" value={compact(current.results)} current={current.results} previous={previous.results} previousValue={compact(previous.results)} accent="gold" />
          <KpiCard label="Custo por resultado" value={money(current.cost_per_result)} current={current.cost_per_result} previous={previous.cost_per_result} previousValue={money(previous.cost_per_result)} />
          <KpiCard label="CTR" value={percent(current.ctr)} current={current.ctr} previous={previous.ctr} previousValue={percent(previous.ctr)} />
          <KpiCard label="CPC médio" value={money(current.cpc)} current={current.cpc} previous={previous.cpc} previousValue={money(previous.cpc)} />
          <KpiCard label="CPM médio" value={money(current.cpm)} current={current.cpm} previous={previous.cpm} previousValue={money(previous.cpm)} />
        </div>
      </section>

      {google && <PlatformOverview id="google-ads" title="Google Ads" subtitle="Desempenho das campanhas de pesquisa e Performance Max" icon={<GoogleAdsLogo size={30} />} current={google} previous={googlePrevious} />}

      <section className="dashboard-section subsection">
        <SectionTitle eyebrow="Google Ads" title="Todas as campanhas" description="Campanhas ordenadas por investimento" compact />
        <DataPanel loading={googleCampaigns.isLoading} error={googleCampaigns.isError}>
          <DataTable items={googleCampaigns.data?.items ?? []} totalCount={googleCampaigns.data?.total_count} />
        </DataPanel>
      </section>

      <section id="performance-max" className="dashboard-section subsection">
        <SectionTitle eyebrow="Google Ads" title="Performance Max" description="Grupos de recursos e sinais de desempenho sem duplicar os totais da campanha" compact />
        <div className="info-banner"><AlertCircle size={17} /><span>As métricas de recursos são exibidas como sinais atribuídos. Elas não são somadas novamente ao total da campanha.</span></div>
        <div className="content-panel">
          <PanelHeading icon={<Layers3 size={18} />} title="Grupos de recursos" count={pmaxGroups.data?.total_count} />
          <DataPanel loading={pmaxGroups.isLoading} error={pmaxGroups.isError} embedded>
            <DataTable kind="pmax" items={pmaxGroups.data?.items ?? []} totalCount={pmaxGroups.data?.total_count} />
          </DataPanel>
        </div>
        <div className="content-panel">
          <PanelHeading icon={<PanelsTopLeft size={18} />} title="Recursos individuais" count={pmaxAssets.data?.total_count} />
          <DataPanel loading={pmaxAssets.isLoading} error={pmaxAssets.isError} embedded>
            <DataTable kind="pmax" items={pmaxAssets.data?.items ?? []} totalCount={pmaxAssets.data?.total_count} />
          </DataPanel>
        </div>
      </section>

      <section className="dashboard-section subsection">
        <SectionTitle eyebrow="Google Ads" title="Evolução dos resultados" description="Leitura diária das principais métricas" compact />
        <DashboardCharts daily={data.daily} source="google_ads" />
      </section>

      <section className="dashboard-section subsection">
        <SectionTitle eyebrow="Google Ads" title="Grupos de anúncios" description="Detalhamento dos grupos ativos no período" compact />
        <DataPanel loading={googleGroups.isLoading} error={googleGroups.isError}>
          <DataTable items={googleGroups.data?.items ?? []} totalCount={googleGroups.data?.total_count} />
        </DataPanel>
      </section>

      {meta && <PlatformOverview id="meta-ads" title="Meta Ads" subtitle="Desempenho das campanhas de Facebook e Instagram" icon={<SiMeta size={28} color="#1877F2" />} current={meta} previous={metaPrevious} />}

      <section className="dashboard-section subsection">
        <SectionTitle eyebrow="Meta Ads" title="Campanhas" description="Campanhas ordenadas por investimento" compact />
        <DataPanel loading={metaCampaigns.isLoading} error={metaCampaigns.isError}>
          <DataTable items={metaCampaigns.data?.items ?? []} totalCount={metaCampaigns.data?.total_count} />
        </DataPanel>
      </section>

      <section className="dashboard-section subsection">
        <SectionTitle eyebrow="Meta Ads" title="Conjuntos de anúncios" description="Públicos, segmentações e resultados" compact />
        <DataPanel loading={metaGroups.isLoading} error={metaGroups.isError}>
          <DataTable items={metaGroups.data?.items ?? []} totalCount={metaGroups.data?.total_count} />
        </DataPanel>
      </section>

      <section className="dashboard-section subsection final-section">
        <SectionTitle eyebrow="Meta Ads" title="Anúncios" description="Criativos com veiculação no período" compact />
        <DataPanel loading={metaAds.isLoading} error={metaAds.isError}>
          <DataTable items={metaAds.data?.items ?? []} totalCount={metaAds.data?.total_count} />
        </DataPanel>
      </section>
    </DashboardShell>
  );
}

function PlatformOverview({ id, title, subtitle, icon, current, previous }: { id: string; title: string; subtitle: string; icon: React.ReactNode; current: Kpis; previous?: Kpis }) {
  return (
    <section id={id} className="dashboard-section platform-section">
      <div className="platform-title"><div className="platform-icon">{icon}</div><div><span>Canal de mídia</span><h2>{title}</h2><p>{subtitle}</p></div></div>
      <div className="kpi-grid platform-grid">
        <KpiCard label="Investimento" value={money(current.spend)} current={current.spend} previous={previous?.spend} previousValue={money(previous?.spend)} accent="red" />
        <KpiCard label="Impressões" value={compact(current.impressions)} current={current.impressions} previous={previous?.impressions} previousValue={compact(previous?.impressions)} />
        <KpiCard label="Cliques" value={compact(current.clicks)} current={current.clicks} previous={previous?.clicks} previousValue={compact(previous?.clicks)} />
        <KpiCard label="Resultados" value={compact(current.results)} current={current.results} previous={previous?.results} previousValue={compact(previous?.results)} accent="gold" />
        <KpiCard label="Custo por resultado" value={money(current.cost_per_result)} current={current.cost_per_result} previous={previous?.cost_per_result} previousValue={money(previous?.cost_per_result)} />
        <KpiCard label="CTR" value={percent(current.ctr)} current={current.ctr} previous={previous?.ctr} previousValue={percent(previous?.ctr)} />
        <KpiCard label="CPC médio" value={money(current.cpc)} current={current.cpc} previous={previous?.cpc} previousValue={money(previous?.cpc)} />
        <KpiCard label="CPM médio" value={money(current.cpm)} current={current.cpm} previous={previous?.cpm} previousValue={money(previous?.cpm)} />
      </div>
    </section>
  );
}

function SectionTitle({ eyebrow, title, description, compact: small }: { eyebrow: string; title: string; description: string; compact?: boolean }) {
  return <div className={`section-heading ${small ? "compact" : ""}`}><span>{eyebrow}</span><div><h1>{title}</h1><p>{description}</p></div></div>;
}

function PanelHeading({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return <div className="panel-heading"><span>{icon}</span><h3>{title}</h3>{typeof count === "number" && <small>{count}</small>}<ChevronRight size={16} /></div>;
}

function DataPanel({ children, loading, error, embedded = false }: { children: React.ReactNode; loading?: boolean; error?: boolean; embedded?: boolean }) {
  if (loading) return <div className={embedded ? "table-loading embedded" : "table-loading"}>{Array.from({ length: 5 }).map((_, index) => <span key={index} />)}</div>;
  if (error) return <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar esta seção.</div>;
  return <>{children}</>;
}

function DashboardLoading() {
  return <div className="screen-state"><img src={brandLogoUrl} alt="Maria Gasolina" /><div className="spinner" /><p>Carregando seu relatório...</p></div>;
}

function DashboardError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return <div className="screen-state error"><AlertCircle size={30} /><h1>Não foi possível abrir o relatório</h1><p>{message ?? "Tente novamente em alguns instantes."}</p><button className="primary-button" onClick={onRetry}>Tentar novamente</button></div>;
}
