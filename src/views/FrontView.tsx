import { isDemoMode } from "../lib/api";
import { AlertCircle, ArrowLeftRight, ArrowRight, Eye, Info, MousePointerClick, Percent, Target, Wallet, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnimatedNumber, BarList, ChartTip, Delta, Funnel, Kpi, Pacing, Panel, Segmented, Skeleton, useTilt } from "../components/ui/primitives";
import { compact, integer, money, percent } from "../lib/format";
import { useGoals } from "../lib/goals";
import { byChannel, dailySeries, monthProgress, totals, weeklySeries } from "../lib/metrics";
import { CREATIVE_RANKING_LIMIT, CREATIVE_RANKING_PREVIEW, rankCreatives } from "../lib/creatives";
import { frontMeta, useChartColors, type DashboardData } from "../lib/use-dashboard";
import type { AppView, CommercialFront, Creative, DateRange, Front, PendingFront } from "../types";
import { commercialFronts, isPendingFront, isPlaceFront } from "../lib/fronts";
import { PlaceComparisonView } from "./PlaceComparisonView";
import type { ChannelFilter } from "../lib/detail-rows";
import { DetailExplorer } from "./DetailExplorer";
import { ImageLightbox } from "../components/ImageLightbox";
import { viewableImage } from "../lib/media";
import { MiniStat } from "./Executive";
import { frontPerformanceSeries } from "../lib/front-performance";
import { FrontPerformanceTooltip } from "../components/FrontPerformanceTooltip";

interface FrontViewProps {
  front: CommercialFront;
  data?: DashboardData;
  range: DateRange;
  onNavigate: (v: AppView) => void;
}

interface FrontControls {
  channelFilter: ChannelFilter;
  onChannelChange: (channel: ChannelFilter) => void;
  onCompare?: () => void;
  compareButton?: RefObject<HTMLButtonElement | null>;
}

export function FrontView({ front, data, range, onNavigate }: FrontViewProps) {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [comparisonOrigin, setComparisonOrigin] = useState<CommercialFront | null>(null);
  const compareButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setComparisonOrigin(null); }, [front]);
  const comparing = comparisonOrigin === front && isPlaceFront(front);
  const controls: FrontControls = { channelFilter, onChannelChange: setChannelFilter, compareButton, onCompare: isPlaceFront(front) ? () => setComparisonOrigin(front) : undefined };
  if (!isPendingFront(front) && !data) throw new Error("Uma frente conectada precisa dos dados do dashboard.");
  const blocked = !isPendingFront(front) && Boolean(data?.isError || data?.isLoading);
  return <>
    {/* Manter a análise montada preserva escala, detalhamento e demais filtros locais. */}
    <div hidden={comparing || blocked} data-testid="front-individual">
      {isPendingFront(front) ? <UnavailableFrontView key={front} front={front} range={range} {...controls} /> : data?.[front] ? <ConnectedFrontView front={front} data={data} range={range} onNavigate={onNavigate} {...controls} /> : null}
    </div>
    {!comparing && blocked && (data?.isError ? (
      <div className="screen-state error" style={{ minHeight: "60vh" }}><AlertCircle size={30} /><h1>Não foi possível carregar os dados</h1><p>{data.error?.message ?? "Tente novamente em alguns instantes."}</p><button type="button" className="primary-button" onClick={data.refetch}>Tentar novamente</button></div>
    ) : <div className="grid grid-4"><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={420} className="span-2" /><Skeleton height={420} className="span-2" /></div>)}
    {comparing && isPlaceFront(front) && <PlaceComparisonView key={front} origin={front} data={data} range={range} channelFilter={channelFilter} onChannelChange={setChannelFilter} onClose={() => { setComparisonOrigin(null); requestAnimationFrame(() => compareButton.current?.focus()); }} />}
  </>;
}

function FrontHeader({ front, channelFilter, onChannelChange, onCompare, compareButton }: { front: CommercialFront } & FrontControls) {
  const meta = commercialFronts[front];
  return <div className="view-head">
    <div>
      <span className="eyebrow"><i style={{ background: meta.color }} />{meta.description}</span>
      <h1>{meta.title}{meta.emphasis && <> <em>{meta.emphasis}</em></>}</h1>
      <p>{meta.introduction}</p>
    </div>
    <div className="front-analysis-controls">
      <Segmented value={channelFilter} onChange={onChannelChange} options={[{ id: "all", label: "Visão geral" }, { id: "meta_ads", label: "Meta Ads" }, { id: "google_ads", label: "Google Ads" }]} />
      {onCompare && <button ref={compareButton} type="button" className="secondary-button" onClick={onCompare}><ArrowLeftRight size={16} />Comparar frentes</button>}
    </div>
  </div>;
}

function UnavailableFrontView({ front, range, channelFilter, onChannelChange, onCompare, compareButton }: { front: PendingFront; range: DateRange } & FrontControls) {
  const [chartMode, setChartMode] = useState<"daily" | "weekly" | "monthly">("daily");
  const meta = commercialFronts[front];
  const empty = <div className="empty-state">Dados ainda não disponíveis para esta frente.</div>;
  return <div className="view-enter" data-testid="unavailable-front" data-front={front}>
    <FrontHeader front={front} channelFilter={channelFilter} onChannelChange={onChannelChange} onCompare={onCompare} compareButton={compareButton} />
    <div className="demo-note" role="status"><Info size={15} /><span>Dados ainda não disponíveis para esta frente.</span></div>
    <div className="grid grid-6 kpi-grid-empty">
      <Kpi label="Investimento" value={null} format={money} accent={meta.accent} icon={<Wallet size={16} />} hideDelta foot="Sem dados associados" />
      <Kpi label="Leads" value={null} format={integer} accent={meta.accent} icon={<Target size={16} />} hideDelta foot="Sem dados associados" />
      <Kpi label="Custo por lead" value={null} format={money} accent="green" icon={<Zap size={16} />} hideDelta foot="Sem dados associados" />
      <Kpi label="Conversão clique → lead" value={null} format={percent} accent="sky" icon={<Percent size={16} />} hideDelta foot="Sem dados associados" />
      <Kpi label="Cliques" value={null} format={integer} accent="navy" icon={<MousePointerClick size={16} />} hideDelta foot="Sem dados associados" />
      <Kpi label="Impressões" value={null} format={compact} accent="navy" icon={<Eye size={16} />} hideDelta foot="Sem dados associados" />
    </div>
    <div className="grid grid-hero" style={{ marginTop: 14 }}>
      <Panel title="Leads e investimento ao longo do tempo" actions={<Segmented value={chartMode} onChange={setChartMode} options={[{ id: "daily", label: "Diário" }, { id: "weekly", label: "Semanal" }, { id: "monthly", label: "Mensal" }]} />}><div className="chart-box empty-chart">{empty}</div></Panel>
      <Panel title="Metas do mês">{empty}</Panel>
    </div>
    <div className="grid grid-3" style={{ marginTop: 14 }}>
      <Panel title="Meta Ads" badge={<span className="chip meta">Meta</span>}>{empty}</Panel>
      <Panel title="Google Ads" badge={<span className="chip google">Google</span>}>{empty}</Panel>
      <Panel title="Leads por semana">{empty}</Panel>
    </div>
    <DetailExplorer front={front} range={range} channelFilter={channelFilter} campaigns={[]} />
    <div className="section-title"><div><h2>Criativos que mais geram leads</h2><p>Os criativos serão exibidos quando houver anúncios associados.</p></div></div>
    <CreativeRanking creatives={[]} emptyLabel="Nenhum criativo vinculado a esta frente." />
  </div>;
}

function ConnectedFrontView({ front, data, range, onNavigate, channelFilter, onChannelChange, onCompare, compareButton }: { front: Front; data: DashboardData; range: DateRange; onNavigate: (v: AppView) => void } & FrontControls) {
  const meta = frontMeta[front];
  const colors = useChartColors();
  const goals = useGoals();
  const bundle = data[front];
  const { current, rows, prevRows } = bundle;
  const [chartMode, setChartMode] = useState<"daily" | "weekly" | "monthly">("daily");
  const [chartTooltipTrigger, setChartTooltipTrigger] = useState<"hover" | "click">("hover");
  const filteredRows = useMemo(
  () =>
    channelFilter === "all"
      ? rows
      : rows.filter((r) => r.channel === channelFilter),
  [rows, channelFilter],
);

const filteredPrevRows = useMemo(
  () =>
    channelFilter === "all"
      ? prevRows
      : prevRows.filter((r) => r.channel === channelFilter),
  [prevRows, channelFilter],
);

const filteredCurrent = useMemo(
  () => totals(filteredRows),
  [filteredRows],
);

const filteredPrevious = useMemo(
  () => totals(filteredPrevRows),
  [filteredPrevRows],
);
const series = useMemo(
  () => dailySeries(filteredRows),
  [filteredRows],
);

const weeks = useMemo(
  () => weeklySeries(filteredRows),
  [filteredRows],
);

  const month = monthProgress(range);
  const monthRows = filteredRows.filter(
    (r) => r.date.slice(0, 7) === range.end.slice(0, 7),
  );
  const monthLeads = monthRows.reduce((s, r) => s + r.leads, 0);
  const monthSpend = monthRows.reduce((s, r) => s + r.spend, 0);
  const monthCpl = monthLeads ? monthSpend / monthLeads : 0;
  const metaT = totals(byChannel(rows, "meta_ads"));
  const googleT = totals(byChannel(rows, "google_ads"));
  const metaP = totals(byChannel(prevRows, "meta_ads"));
  const googleP = totals(byChannel(prevRows, "google_ads"));
  const campaigns = useMemo(
    () => data.campaigns.filter((c) => c.front === front && (channelFilter === "all" || c.channel === channelFilter)),
    [data.campaigns, front, channelFilter],
  );
  // Só peças de Meta Ads: o canal é filtrado antes da ordenação, então o
  // ranking já nasce sem buracos deixados por anúncios do Google.
  const creatives = useMemo(() => rankCreatives(data.creatives, front), [data.creatives, front]);
  const crm = data.crm[front];
  const accentHex = front === "franchise" ? colors.red : colors.gold;
  const chartData = useMemo(() => frontPerformanceSeries(filteredRows, range, chartMode), [filteredRows, range, chartMode]);
  const chartPeriod = { daily: "do dia", weekly: "da semana (segunda a domingo)", monthly: "do mês" }[chartMode];

  return (
    <div className="view-enter" key={front}>
      <FrontHeader front={front} channelFilter={channelFilter} onChannelChange={onChannelChange} onCompare={onCompare} compareButton={compareButton} />

      <div className="grid grid-6">
  <Kpi label="Investimento" value={filteredCurrent.spend} previous={filteredPrevious.spend} format={money} accent={meta.accent} icon={<Wallet size={16} />} spark={series.map((d) => d.spend)} />
  <Kpi label={`Leads (${meta.leadWord})`} value={filteredCurrent.leads} previous={filteredPrevious.leads} format={integer} accent={meta.accent} icon={<Target size={16} />} spark={series.map((d) => d.leads)} />
  <Kpi label="Custo por lead" value={filteredCurrent.cpl} previous={filteredPrevious.cpl} format={money} accent="green" icon={<Zap size={16} />} lowerIsBetter spark={series.map((d) => d.cpl ?? 0)} />
  <Kpi label="Conversão clique → lead" value={filteredCurrent.conv_rate} previous={filteredPrevious.conv_rate} format={percent} accent="sky" icon={<Percent size={16} />} />
  <Kpi label="Cliques" value={filteredCurrent.clicks} previous={filteredPrevious.clicks} format={integer} accent="navy" icon={<MousePointerClick size={16} />} spark={series.map((d) => d.clicks)} />
  <Kpi label="Impressões" value={filteredCurrent.impressions} previous={filteredPrevious.impressions} format={compact} accent="navy" icon={<Eye size={16} />} spark={series.map((d) => d.impressions)} />
</div>

      <div className="grid grid-hero" style={{ marginTop: 14 }}>
        <Panel title="Leads e investimento ao longo do tempo" description={`Barras são leads, a linha é o investimento ${chartPeriod}`} actions={<Segmented value={chartMode} onChange={setChartMode} options={[{ id: "daily", label: "Diário" }, { id: "weekly", label: "Semanal" }, { id: "monthly", label: "Mensal" }]} />}>
          <div className="chart-box h-320" data-testid="front-performance-chart"
            onPointerDown={(event) => setChartTooltipTrigger(event.pointerType === "touch" ? "click" : "hover")}
            onPointerMove={(event) => { if (event.pointerType === "mouse") setChartTooltipTrigger("hover"); }}
            onKeyDown={() => setChartTooltipTrigger("hover")}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10.5 }} dy={8} minTickGap={22} />
                <YAxis yAxisId="l" allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fill: colors.tick, fontSize: 10 }} />
                <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={58} tick={{ fill: colors.tick, fontSize: 10 }} tickFormatter={(v) => money(Number(v)).replace(",00", "")} />
                <Tooltip trigger={chartTooltipTrigger} content={<FrontPerformanceTooltip />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar yAxisId="l" dataKey="leads" name="Leads" fill={colors.gold} radius={[6, 6, 0, 0]} maxBarSize={26} isAnimationActive animationDuration={1200} />
                <Line yAxisId="r" type="monotone" dataKey="spend" name="Investimento" stroke={colors.green} strokeWidth={2.5} dot={chartData.length === 1 ? { r: 4, fill: colors.green } : false} isAnimationActive animationDuration={1600} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: colors.gold }} />Leads</span><span><i style={{ background: colors.green }} />Investimento</span></div>
        </Panel>
        <Panel title="Metas do mês" description={`Dia ${month.elapsed} de ${month.daysInMonth} · projeção linear`}>
          <div className="pacing-list">
            <Pacing label={`Leads · ${meta.short}`} actual={monthLeads} goal={front === "franchise" ? goals.leads_franchise : goals.leads_condominium} ratio={month.ratio} color={meta.color} format={integer} />
            <Pacing label="CPL (quanto menor, melhor)" actual={monthCpl} goal={front === "franchise" ? goals.cpl_franchise : goals.cpl_condominium} ratio={1} color="var(--green)" format={money} lowerIsBetter />
            <Pacing label="Fatia da verba total" actual={monthSpend} goal={goals.media_budget * (front === "franchise" ? 0.7 : 0.3)} ratio={month.ratio} color={meta.color} format={money} lowerIsBetter />
          </div>
          <div className="grid grid-2" style={{ gap: 10, marginTop: 16 }}>
            <MiniStat
              label="CPC"
              value={filteredCurrent.cpc ?? 0}
              format={money}
              delta={
                <Delta
                  current={filteredCurrent.cpc}
                  previous={filteredPrevious.cpc}
                  lowerIsBetter
                />
              }
            />

            <MiniStat
              label="CTR"
              value={filteredCurrent.ctr ?? 0}
              format={percent}
              delta={
                <Delta
                  current={filteredCurrent.ctr}
                  previous={filteredPrevious.ctr}
                />
              }
            />
          </div>
        </Panel>
      </div>

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        <ChannelCard name="Meta Ads" chip="meta" color={colors.meta} t={metaT} p={metaP} />
        <ChannelCard name="Google Ads" chip="google" color={colors.google} t={googleT} p={googleP} />
        <Panel title="Leads por semana" description="Semanas completas dentro do período">
          <div className="chart-box h-180">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks.map((w) => ({ label: w.label, Leads: w.leads }))} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10 }} />
                <Tooltip content={<ChartTip format={integer} />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar dataKey="Leads" fill={accentHex} radius={[6, 6, 0, 0]} maxBarSize={30} isAnimationActive animationDuration={1200} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <DetailExplorer front={front} range={range} channelFilter={channelFilter} campaigns={campaigns} />

      <div className="section-title"><div><h2>Criativos que mais geram leads</h2><p>Ranking das peças de Meta Ads por leads no período. Passe o mouse para o efeito de profundidade.</p></div></div>
      <CreativeRanking creatives={creatives} />

      <div className="grid grid-wide" style={{ marginTop: 28 }}>
        <Panel title={`Funil comercial · ${meta.short}`} description="Do lead ao contrato, com as taxas entre etapas" badge={<span className="badge sky">{isDemoMode ? "CRM Elo · demonstração" : crm.snapshot_available ? "CRM Elo" : "Integração pendente"}</span>}>
          {!crm.snapshot_available && <p className="manual-foot" role="status">Aguardando integração com CRM Elo.</p>}
          <Funnel stages={crm.stages} color={meta.color} format={integer} dense />
        </Panel>
        <Panel className="fill-body" title="Onde os leads entram" description="Participação de cada origem no funil">
          <BarList items={crm.sources.map((s, i) => ({ name: s.name, value: s.leads, color: [colors.meta, colors.google, colors.instagram, colors.gold][i] }))} format={integer} />
          <button type="button" className="secondary-button" style={{ marginTop: 16, width: "100%" }} onClick={() => onNavigate("crm")}>Abrir CRM e vendas <ArrowRight size={15} /></button>
        </Panel>
      </div>
    </div>
  );
}

export function CreativeRanking({ creatives, emptyLabel = "Nenhum criativo de Meta Ads com dados neste período." }: { creatives: Creative[]; emptyLabel?: string }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [creatives]);
  const visible = creatives.slice(0, expanded ? CREATIVE_RANKING_LIMIT : CREATIVE_RANKING_PREVIEW);

  if (!creatives.length) return <div className="empty-state">{emptyLabel}</div>;

  return (
    <div className="creative-ranking">
      <div id="creative-ranking-grid" className="creative-grid">
        {visible.map((creative, index) => (
          <CreativeCard
            key={creative.id}
            c={creative}
            rank={index + 1}
            revealed={index >= CREATIVE_RANKING_PREVIEW}
          />
        ))}
      </div>
      {creatives.length > CREATIVE_RANKING_PREVIEW && (
        <div className="creative-ranking-actions">
          <button
            type="button"
            className="secondary-button creative-ranking-toggle"
            aria-expanded={expanded}
            aria-controls="creative-ranking-grid"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Mostrar menos" : "Ver mais criativos"}
          </button>
        </div>
      )}
    </div>
  );
}

function ChannelCard({ name, chip, color, t, p }: { name: string; chip: string; color: string; t: ReturnType<typeof totals>; p: ReturnType<typeof totals> }) {
  return (
    <Panel title={name} badge={<span className={`chip ${chip}`}>{chip === "meta" ? "Meta" : "Google"}</span>}>
      <div className="front-main" style={{ marginTop: 4 }}><strong style={{ fontSize: 32 }}><AnimatedNumber value={t.leads} format={integer} /></strong><small>leads</small><span style={{ marginLeft: "auto" }}><Delta current={t.leads} previous={p.leads} /></span></div>
      <div className="front-meta" style={{ marginTop: 14 }}>
        <div><small>Investimento</small><b>{money(t.spend)}</b></div>
        <div><small>CPL</small><b style={{ color }}>{money(t.cpl)}</b></div>
        <div><small>CTR</small><b>{percent(t.ctr)}</b></div>
      </div>
    </Panel>
  );
}

export function CreativeCard({ c, rank, revealed = false }: { c: Creative; rank: number; revealed?: boolean }) {
  const tilt = useTilt<HTMLElement>(7);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => { setImageFailed(false); setImageRatio(null); }, [c.preview_url]);
  const image = c.channel === "meta_ads" && !imageFailed ? viewableImage(c.preview_url ?? null) : null;
  const format = c.channel === "meta_ads" ? c.creative_type : null;
  const formatLabel = format === "dynamic" ? "Dinâmico"
    : format === "video" ? "Vídeo"
    : format === "carousel" ? "Carrossel"
    : format === "image" ? "Estático"
    : c.format === "video" ? "Vídeo" : c.format === "carousel" ? "Carrossel" : "Estático";
  return (
    <>
    <article ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className={`creative tilt ${rank <= 3 ? "creative-top" : "creative-secondary"}${revealed ? " creative-reveal" : ""}`} style={{ "--c1": c.palette[0], "--c2": c.palette[1] } as React.CSSProperties}>
      <div className={`creative-art${format === "video" ? " creative-art-video" : ""}${image ? " creative-art-has-preview" : ""}`} style={imageRatio ? { aspectRatio: imageRatio } : undefined}>
        {image && <button type="button" className="creative-zoom" aria-label={`Ampliar imagem: ${c.name}`} onClick={() => setZoomed(true)}>
          <img src={image} alt="" onLoad={event => { const { naturalWidth, naturalHeight } = event.currentTarget; if (naturalWidth > 0 && naturalHeight > 0) setImageRatio(naturalWidth / naturalHeight); }} onError={() => { setImageFailed(true); setZoomed(false); }} />
        </button>}
        <span className="format">{formatLabel}</span>
        <span className={`rank${rank > 3 ? " rank-secondary" : ""}`}>{rank}</span>
        {!image && <h4>{c.headline}</h4>}
      </div>
      <div className="creative-body">
        <div className="creative-copy">
          <strong title={c.name}>{c.name}</strong>
          <small title={c.headline}>{c.headline}</small>
        </div>
        <div className="creative-stats">
          <div><b>{integer(c.leads)}</b><span>leads</span></div>
          <div><b>{money(c.cpl).replace(",00", "")}</b><span>CPL</span></div>
          <div><b>{c.hook_rate != null ? percent(c.hook_rate) : percent(c.ctr)}</b><span>{c.hook_rate != null ? "hook" : "CTR"}</span></div>
        </div>
      </div>
    </article>
    {zoomed && image && <ImageLightbox src={image} label={c.name} onClose={() => setZoomed(false)} />}
    </>
  );
}
