import { ChevronLeft, ChevronRight, Clapperboard, Film, GalleryHorizontalEnd, Images, Pause, Play, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { lazy, Suspense } from "react";
const BrazilMap = lazy(() => import("../components/three/BrazilMap").then((m) => ({ default: m.BrazilMap })));
import { AnimatedNumber, Funnel, Kpi, Pacing, Ring } from "../components/ui/primitives";
import { brandLogoUrl } from "../lib/app-path";
import { isDemoMode } from "../lib/api";
import { compact, integer, money, percent, shortDate } from "../lib/format";
import { useGoals } from "../lib/goals";
import { monthProgress } from "../lib/metrics";
import { toMapCities, useNetworkUnits } from "../lib/network-units";
import { frontMeta, type DashboardData } from "../lib/use-dashboard";
import type { CommercialFront, DateRange, Front } from "../types";
import { CreativeCard } from "./FrontView";
import { rankCreatives } from "../lib/creatives";
import { COMMERCIAL_DEMO_LABEL } from "../lib/commercial-demo";
import { presentationLayout, presentationSlides, presentationSlideIndex } from "../lib/presentation-layout";
import "../presentation.css";
import { ContentTypeRow, PostCard } from "./Organic";

import { CommercialFrontSelector } from "../components/CommercialFrontSelector";
import { commercialFronts } from "../lib/fronts";
import { buildCrmSummary } from "../lib/crm";
import { exampleCrmSummary } from "../lib/commercial-examples";

const SLIDE_MS = 14000;

export function Presentation({ data, range, onExit, commercialDemo = false, onCommercialDemoChange, salesFront, onSalesFrontChange }: { data: DashboardData; range: DateRange; onExit: () => void; commercialDemo?: boolean; onCommercialDemoChange?: (next: boolean) => void; salesFront?: CommercialFront; onSalesFrontChange?: (next: CommercialFront) => void }) {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [localDemo, setLocalDemo] = useState(false);
  const illustrative = onCommercialDemoChange ? commercialDemo : localDemo;
  const setIllustrative = (next: boolean) => { setLocalDemo(next); onCommercialDemoChange?.(next); };
  const goals = useGoals();
  const layout = presentationLayout(viewport.width, viewport.height);
  const slides = useMemo(() => presentationSlides(data.creatives, viewport.width, viewport.height), [data.creatives, viewport]);
  const currentIndex = Math.min(index, slides.length - 1);
  const slide = slides[currentIndex];
  const inspecting = () => Boolean(document.querySelector('.lightbox'));
  const next = () => { if (!inspecting()) setIndex(i => (Math.min(i, slides.length - 1) + 1) % slides.length); };
  const prev = () => { if (!inspecting()) setIndex(i => (Math.min(i, slides.length - 1) - 1 + slides.length) % slides.length); };
  useEffect(() => {
    const resize = () => {
      const nextViewport = { width: window.innerWidth, height: window.innerHeight };
      setIndex(presentationSlideIndex(presentationSlides(data.creatives, nextViewport.width, nextViewport.height), slide));
      setViewport(nextViewport);
    };
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, [data.creatives, slide]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(next, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [playing, currentIndex, slides.length]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (inspecting()) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input,select,textarea,[role=switch]')) return;
      if (event.key === 'Escape') onExit();
      if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); prev(); }
      if (event.key === ' ' && !target?.closest('button')) { event.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onExit, slides.length]);
  useEffect(() => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined); };
  }, []);
  useEffect(() => {
    if (salesFront && salesFront !== "franchise") setIndex(slides.findIndex(item => item.id === `${salesFront}-crm-0`));
  }, [salesFront]);
  const period = `${shortDate(range.start)} a ${shortDate(range.end)}`;
  const title = slide.kind === 'executive' ? 'O crescimento da rede' : slide.kind === 'pacing' ? 'Ritmo do mês' : slide.kind.startsWith('organic') ? (slide.kind === 'organic' ? 'Presença orgânica' : 'Destaques orgânicos') : `${commercialFronts[slide.front!].short} · ${slide.kind === 'creatives' ? 'Criativos por leads' : slide.kind === 'crm' ? 'Pipeline comercial' : 'Resultados de mídia'}`;
  return <div className="present responsive-present" style={{ '--presentation-scale': layout.scale } as CSSProperties}>
    <div className="ambient" />
    <header className="present-top">
      <div className="present-brand"><img src={brandLogoUrl} alt="Maria Gasolina" /><div className="t"><small>Maria Gasolina Express · {period}</small><strong>{title}</strong>{isDemoMode && <small role="status">Modo demonstração · dados de mídia ilustrativos</small>}</div></div>
      <button type="button" className="icon-button" onClick={onExit} aria-label="Sair da apresentação"><X size={18} /></button>
    </header>
    <div className="present-slide" data-slide={slide.id} data-kind={slide.kind} key={slide.id}>
      {slide.kind === 'executive' && <ExecutiveSlide data={data} range={range} />}{slide.kind === 'pacing' && <ExecutivePacingSlide data={data} range={range} offset={slide.offset ?? 0} count={slide.count ?? 5} />}
      {slide.kind === 'front' && <FrontSlide data={data} range={range} front={slide.front! as Front} goals={goals} />}
      {slide.kind === 'creatives' && <section className="presentation-creatives" aria-label="Criativos por leads"><div className="creative-grid" style={{gridTemplateColumns: `repeat(${slide.count}, minmax(0, 1fr))`}}>{rankCreatives(data.creatives, slide.front! as Front).slice(slide.offset, (slide.offset ?? 0) + slide.count!).map((c, i) => <CreativeCard key={c.id} c={c} rank={(slide.offset ?? 0) + i + 1} />)}</div></section>}
      {slide.kind === 'crm' && <CommercialSlide data={data} range={range} front={slide.front!} illustrative={illustrative} offset={slide.offset!} count={slide.count!} onFrontChange={front => { onSalesFrontChange?.(front); setIndex(slides.findIndex(item => item.id === `${front}-crm-0`)); }} />}
      {slide.kind.startsWith('organic') && <OrganicSlide data={data} postsOnly={slide.kind === 'organic-posts'} />}
    </div>
    <footer className="present-bottom">
      <span className="presentation-counter">{currentIndex + 1} / {slides.length} · Setas para navegar · Esc sai</span>
      <button type="button" className="secondary-button commercial-demo-toggle" aria-pressed={illustrative} onClick={() => setIllustrative(!illustrative)}>{illustrative ? 'Voltar aos dados reais' : 'Funis ilustrativos'}</button>
      <nav className="present-controls" aria-label="Navegação da apresentação">
        <button type="button" className="icon-button" onClick={prev} aria-label="Anterior"><ChevronLeft size={18} /></button>
        <button type="button" className="icon-button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pausar' : 'Reproduzir'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <button type="button" className="icon-button" onClick={next} aria-label="Próximo"><ChevronRight size={18} /></button>
      </nav>
    </footer>
  </div>;
}

function CommercialSlide({ data, range, front, illustrative, offset, count, onFrontChange }: { data: DashboardData; range: DateRange; front: CommercialFront; illustrative: boolean; offset: number; count: number; onFrontChange: (front: CommercialFront) => void }) {
  const operational = data.crm[front] ?? buildCrmSummary(front, null, null, { rows: [] });
  const crm = illustrative ? exampleCrmSummary(front, range) : operational;
  return <div className="presentation-commercial">
    <div className="presentation-commercial-head"><CommercialFrontSelector id="presentation-sales-front" front={front} onChange={onFrontChange} /><p className="presentation-source" role="status">{illustrative || isDemoMode ? COMMERCIAL_DEMO_LABEL + ' · sem gravação operacional.' : crm.snapshot_available || crm.results_available ? 'Registros comerciais disponíveis' : 'Aguardando integração com CRM Elo.'}</p></div>
    <div className="grid grid-3">
      <Kpi label="Contratos no período" value={crm.contracts} format={integer} accent="gold" hideDelta />
      <Kpi label="Receita no período" value={crm.revenue} format={money} accent="green" hideDelta />
      <Kpi label="Oportunidades abertas" value={crm.open_opportunities} format={integer} accent="sky" hideDelta />
    </div>
    <section className="panel presentation-funnel" style={{ "--stage-count": Math.min(count, crm.stages.length - offset) } as CSSProperties}><div className="panel-head"><div><h3>Pipeline · {commercialFronts[front].short}</h3><p>Etapas {offset + 1} a {Math.min(offset + count, crm.stages.length)} de {crm.stages.length} · estoque atual por etapa</p></div></div><Funnel stages={crm.stages.slice(offset, offset + count)} color={commercialFronts[front].color} format={integer} pipelineTotal={crm.open_opportunities ?? 0} dense /></section>
  </div>;
}

function ExecutiveSlide({ data, range }: { data: DashboardData; range: DateRange }) {
  const organicAvailable = data.organicOrigin === "supabase" || isDemoMode;
  const goals = useGoals();
  const month = monthProgress(range);
  const monthRows = data.current.filter((r) => r.date.slice(0, 7) === range.end.slice(0, 7));
  const spend = monthRows.reduce((s, r) => s + r.spend, 0);
  // Mesma fonte do hero da Visão executiva. Na TV o mapa simplesmente não
  // aparece se a base não carregar, sem derrubar o resto do slide.
  const network = useNetworkUnits();
  const mapCities = useMemo(() => (network.data ? toMapCities(network.data) : []), [network.data]);
  return (
    <div className="presentation-executive">
      <div className="presentation-stack">
        <div className="grid grid-4">
          <Kpi label="Investimento" value={data.all.current.spend} previous={data.all.previous.spend} format={money} accent="red" />
          <Kpi label="Leads gerados" value={data.all.current.leads} previous={data.all.previous.leads} format={integer} accent="gold" />
          <Kpi label="Custo por lead" value={data.all.current.cpl} previous={data.all.previous.cpl} format={money} accent="green" lowerIsBetter />
          <Kpi label="Novos seguidores" value={organicAvailable ? data.instagram.current.new_followers + data.facebook.current.new_followers : null} previous={organicAvailable ? data.instagram.previous.new_followers + data.facebook.previous.new_followers : null} format={integer} accent="violet" hideDelta={!organicAvailable} foot={organicAvailable ? undefined : "Integração orgânica pendente"} />
        </div>
        <section className="panel hero" style={{ minHeight: 0 }}>{mapCities.length > 0 && <Suspense fallback={null}><BrazilMap cities={mapCities} /></Suspense>}<div className="hero-copy"><span className="eyebrow"><i style={{ background: "var(--red)" }} />Rede em expansão</span><h2>Onde a Maria Gasolina já está</h2></div></section>
      </div>

    </div>
  );
}

function ExecutivePacingSlide({ data, range, offset, count }: { data: DashboardData; range: DateRange; offset: number; count: number }) {
 const goals = useGoals(); const month = monthProgress(range);
 const monthRows = data.current.filter(r => r.date.slice(0, 7) === range.end.slice(0, 7));
 const spend = monthRows.reduce((sum, row) => sum + row.spend, 0);
 return (      <section className="panel presentation-pacing"><div className="panel-head"><div><h3>Ritmo do mês</h3><p>Contra as metas definidas com a GT+</p></div></div>
        <div className="pacing-list" style={{ '--pacing-rows': Math.ceil(Math.min(count, 5 - offset) / 2) } as CSSProperties}>
          {[
          <Pacing key="budget" label="Verba de mídia" actual={spend} goal={goals.media_budget} ratio={month.ratio} color="var(--red)" format={money} lowerIsBetter />,
          <Pacing key="franchise" label="Leads · Franquias" actual={monthRows.filter((r) => r.front === "franchise").reduce((s, r) => s + r.leads, 0)} goal={goals.leads_franchise} ratio={month.ratio} color="var(--red)" format={integer} />,
          <Pacing key="condominium" label="Leads · Condomínios" actual={monthRows.filter((r) => r.front === "condominium").reduce((s, r) => s + r.leads, 0)} goal={goals.leads_condominium} ratio={month.ratio} color="var(--gold)" format={integer} />,
          <Pacing key="posts" label="Posts publicados" actual={data.delivery.posts_published} goal={goals.posts} ratio={month.ratio} color="var(--violet)" format={integer} />,
          <Pacing key="stories" label="Stories publicados" actual={data.delivery.stories_published} goal={goals.stories} ratio={month.ratio} color="var(--violet)" format={integer} />,
          ].slice(offset, offset + count)}
        </div>
      </section>);
}

function FrontSlide({ data, front, goals, range }: { data: DashboardData; front: Front; goals: ReturnType<typeof useGoals>; range: DateRange }) {
  const b = data[front];
  const meta = frontMeta[front];
  const month = monthProgress(range);
  const monthLeads = b.rows.filter((r) => r.date.slice(0, 7) === range.end.slice(0, 7)).reduce((s, r) => s + r.leads, 0);
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 18, minHeight: 0 }}>
      <div className="grid grid-4">
        <Kpi label="Investimento" value={b.current.spend} previous={b.previous.spend} format={money} accent={meta.accent} />
        <Kpi label={`Leads (${meta.leadWord})`} value={b.current.leads} previous={b.previous.leads} format={integer} accent={meta.accent} />
        <Kpi label="Custo por lead" value={b.current.cpl} previous={b.previous.cpl} format={money} accent="green" lowerIsBetter />
        <Kpi label="Conversão clique → lead" value={b.current.conv_rate} previous={b.previous.conv_rate} format={percent} accent="sky" />
      </div>
      <div className="presentation-front-goals">
        <section className="panel"><div className="panel-head"><div><h3>Meta do mês</h3></div></div><div className="pacing-list"><Pacing label={`Leads · ${meta.short}`} actual={monthLeads} goal={front === "franchise" ? goals.leads_franchise : goals.leads_condominium} ratio={month.ratio} color={meta.color} format={integer} /></div>
          <div className="ring-row" style={{ marginTop: 18 }}><Ring value={((b.current.cpl ?? 0) * 100) / (front === "franchise" ? goals.cpl_franchise : goals.cpl_condominium)} label="CPL em relação ao alvo" sub={`${money(b.current.cpl)} de ${money(front === "franchise" ? goals.cpl_franchise : goals.cpl_condominium)} · abaixo é melhor`} color="var(--green)" /></div>
        </section>
      </div>
    </div>
  );
}

function OrganicSlide({ data, postsOnly }: { data: DashboardData; postsOnly: boolean }) {
  if (data.organicOrigin !== "supabase" && !isDemoMode) return (
    <section className="panel"><div className="empty-state" role="status" style={{ flexDirection: "column", gap: 8 }}><h3>Integração orgânica pendente</h3><p>Dados reais de Instagram e Facebook ainda não disponíveis.</p></div></section>
  );
  const ig = data.instagram;
  const posts = [...data.posts].sort((a, b) => b.engagement_rate * b.reach - a.engagement_rate * a.reach).slice(0, 3);
  if (postsOnly) return <div className="post-grid">{posts.map((p, i) => <PostCard key={p.id} p={p} rank={i + 1} />)}</div>;
  return (
    <div className="presentation-organic" style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: 18, minHeight: 0 }}>
      <div className="grid grid-6">
        <Kpi label="Seguidores IG" value={ig.current.followers} previous={ig.previous.followers} format={integer} accent="violet" />
        <Kpi label="Novos seguidores" value={ig.current.new_followers} previous={ig.previous.new_followers} format={integer} accent="violet" />
        <Kpi label="Engajamento" value={ig.current.engagement_rate} previous={ig.previous.engagement_rate} format={percent} accent="gold" />
        <Kpi label="Alcance" value={ig.current.reach} previous={ig.previous.reach} format={compact} accent="navy" />
        <Kpi label="Comentários" value={ig.current.comments} previous={ig.previous.comments} format={integer} accent="sky" />
        <Kpi label="DMs" value={ig.current.dms} previous={ig.previous.dms} format={integer} accent="green" />
      </div>
      <div style={{ display: "grid", minHeight: 0 }}>
        <section className="panel"><div className="panel-head"><div><h3>Conteúdos postados no mês</h3><p>Quantidade por formato</p></div></div>
          <div className="content-type-list">
            <ContentTypeRow icon={<Images size={16} />} label="Feed" value={data.delivery.posts_published} color="var(--violet)" />
            <ContentTypeRow icon={<Clapperboard size={16} />} label="Stories" value={data.delivery.stories_published} color="var(--gold)" />
            <ContentTypeRow icon={<Film size={16} />} label="Reels" value={data.delivery.reels_published} color="var(--red)" />
            <ContentTypeRow icon={<GalleryHorizontalEnd size={16} />} label="Carrossel" value={data.delivery.carousel_published} color="var(--sky)" />
            <ContentTypeRow icon={<Zap size={16} />} label="Instant" value={data.delivery.instant_published} color="var(--green)" />
          </div>
        </section>
      </div>
    </div>
  );
}

export function PresentationNumber({ value }: { value: number }) { return <AnimatedNumber value={value} format={integer} />; }
