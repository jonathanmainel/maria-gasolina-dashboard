import { ChevronLeft, ChevronRight, Clapperboard, Film, GalleryHorizontalEnd, Images, Pause, Play, X, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { lazy, Suspense } from "react";
const BrazilMap = lazy(() => import("../components/three/BrazilMap").then((m) => ({ default: m.BrazilMap })));
import { AnimatedNumber, Funnel, Kpi, Pacing, Ring } from "../components/ui/primitives";
import { brandLogoUrl } from "../lib/app-path";
import { compact, integer, money, percent, shortDate } from "../lib/format";
import { useGoals } from "../lib/goals";
import { monthProgress } from "../lib/metrics";
import { toMapCities, useNetworkUnits } from "../lib/network-units";
import { frontMeta, type DashboardData } from "../lib/use-dashboard";
import type { DateRange, Front } from "../types";
import { CreativeCard } from "./FrontView";
import { ContentTypeRow, PostCard } from "./Organic";

const SLIDE_MS = 14000;

export function Presentation({ data, range, onExit }: { data: DashboardData; range: DateRange; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const goals = useGoals();
  const slides = useMemo(() => ["executive", "franchise", "condominium", "organic", "crm"] as const, []);
  const next = () => setIndex((i) => (i + 1) % slides.length);
  const prev = () => setIndex((i) => (i - 1 + slides.length) % slides.length);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(next, SLIDE_MS);
    return () => window.clearInterval(t);
  }, [playing, index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") prev(); if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);
  useEffect(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => undefined);
    return () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined); };
  }, []);
  const slide = slides[index];
  const month = monthProgress(range);
  const period = `${shortDate(range.start)} a ${shortDate(range.end)}`;

  return (
    <div className="present">
      <div className="ambient" />
      <button type="button" className="icon-button present-exit" onClick={onExit} aria-label="Sair"><X size={18} /></button>
      <div className="present-controls">
        <button type="button" className="icon-button" onClick={prev} aria-label="Anterior"><ChevronLeft size={18} /></button>
        <button type="button" className="icon-button" onClick={() => setPlaying((p) => !p)} aria-label="Pausar">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        <button type="button" className="icon-button" onClick={next} aria-label="Próximo"><ChevronRight size={18} /></button>
      </div>
      <div className="present-slide" key={slide}>
        <div className="present-top">
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src={brandLogoUrl} alt="" />
            <div className="t"><small>Maria Gasolina Express · {period}</small><strong>{titles[slide]}</strong></div>
          </div>
          <div className="r">Relatório GT+<b>Dia {month.elapsed} de {month.daysInMonth}</b></div>
        </div>
        <div className="present-body">
          {slide === "executive" && <ExecutiveSlide data={data} range={range} />}
          {(slide === "franchise" || slide === "condominium") && <FrontSlide data={data} range={range} front={slide} goals={goals} />}
          {slide === "organic" && <OrganicSlide data={data} />}
          {slide === "crm" && <CrmSlide data={data} />}
        </div>
        <div className="present-bottom">
          <div className="present-dots" style={{ "--dur": `${SLIDE_MS}ms` } as React.CSSProperties}>{slides.map((s, i) => <i key={s} className={i < index ? "done" : i === index && playing ? "active" : ""} />)}</div>
          <span>Setas para navegar · espaço pausa · Esc sai</span>
        </div>
      </div>
    </div>
  );
}

const titles = { executive: <>O crescimento da rede, <em>em uma tela</em></>, franchise: <>Expansão de <em>franquias</em></>, condominium: <>Captação de <em>condomínios</em></>, organic: <>Presença <em>orgânica</em></>, crm: <>Funil comercial e <em>receita</em></> };

function ExecutiveSlide({ data, range }: { data: DashboardData; range: DateRange }) {
  const goals = useGoals();
  const month = monthProgress(range);
  const monthRows = data.current.filter((r) => r.date.slice(0, 7) === range.end.slice(0, 7));
  const spend = monthRows.reduce((s, r) => s + r.spend, 0);
  // Mesma fonte do hero da Visão executiva. Na TV o mapa simplesmente não
  // aparece se a base não carregar, sem derrubar o resto do slide.
  const network = useNetworkUnits();
  const mapCities = useMemo(() => (network.data ? toMapCities(network.data) : []), [network.data]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, minHeight: 0 }}>
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 18, minHeight: 0 }}>
        <div className="grid grid-4">
          <Kpi label="Investimento" value={data.all.current.spend} previous={data.all.previous.spend} format={money} accent="red" />
          <Kpi label="Leads gerados" value={data.all.current.leads} previous={data.all.previous.leads} format={integer} accent="gold" />
          <Kpi label="Custo por lead" value={data.all.current.cpl} previous={data.all.previous.cpl} format={money} accent="green" lowerIsBetter />
          <Kpi label="Novos seguidores" value={data.instagram.current.new_followers + data.facebook.current.new_followers} previous={data.instagram.previous.new_followers + data.facebook.previous.new_followers} format={integer} accent="violet" />
        </div>
        <section className="panel hero" style={{ minHeight: 0 }}>{mapCities.length > 0 && <Suspense fallback={null}><BrazilMap cities={mapCities} /></Suspense>}<div className="hero-copy"><span className="eyebrow"><i style={{ background: "var(--red)" }} />Rede em expansão</span><h2>Onde a Maria Gasolina já está</h2></div></section>
      </div>
      <section className="panel"><div className="panel-head"><div><h3>Ritmo do mês</h3><p>Contra as metas definidas com a GT+</p></div></div>
        <div className="pacing-list">
          <Pacing label="Verba de mídia" actual={spend} goal={goals.media_budget} ratio={month.ratio} color="var(--red)" format={money} lowerIsBetter />
          <Pacing label="Leads · Franquias" actual={monthRows.filter((r) => r.front === "franchise").reduce((s, r) => s + r.leads, 0)} goal={goals.leads_franchise} ratio={month.ratio} color="var(--red)" format={integer} />
          <Pacing label="Leads · Condomínios" actual={monthRows.filter((r) => r.front === "condominium").reduce((s, r) => s + r.leads, 0)} goal={goals.leads_condominium} ratio={month.ratio} color="var(--gold)" format={integer} />
          <Pacing label="Posts publicados" actual={data.delivery.posts_published} goal={goals.posts} ratio={month.ratio} color="var(--violet)" format={integer} />
          <Pacing label="Stories publicados" actual={data.delivery.stories_published} goal={goals.stories} ratio={month.ratio} color="var(--violet)" format={integer} />
        </div>
      </section>
    </div>
  );
}

function FrontSlide({ data, front, goals, range }: { data: DashboardData; front: Front; goals: ReturnType<typeof useGoals>; range: DateRange }) {
  const b = data[front];
  const meta = frontMeta[front];
  const month = monthProgress(range);
  const monthLeads = b.rows.filter((r) => r.date.slice(0, 7) === range.end.slice(0, 7)).reduce((s, r) => s + r.leads, 0);
  const creatives = data.creatives.filter((c) => c.front === front).sort((x, y) => y.leads - x.leads).slice(0, 4);
  const crm = data.crm[front];
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 18, minHeight: 0 }}>
      <div className="grid grid-4">
        <Kpi label="Investimento" value={b.current.spend} previous={b.previous.spend} format={money} accent={meta.accent} />
        <Kpi label={`Leads (${meta.leadWord})`} value={b.current.leads} previous={b.previous.leads} format={integer} accent={meta.accent} />
        <Kpi label="Custo por lead" value={b.current.cpl} previous={b.previous.cpl} format={money} accent="green" lowerIsBetter />
        <Kpi label="Conversão clique → lead" value={b.current.conv_rate} previous={b.previous.conv_rate} format={percent} accent="sky" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr", gap: 18, minHeight: 0 }}>
        <section className="panel"><div className="panel-head"><div><h3>Meta do mês</h3></div></div><div className="pacing-list"><Pacing label={`Leads · ${meta.short}`} actual={monthLeads} goal={front === "franchise" ? goals.leads_franchise : goals.leads_condominium} ratio={month.ratio} color={meta.color} format={integer} /></div>
          <div className="ring-row" style={{ marginTop: 18 }}><Ring value={((b.current.cpl ?? 0) * 100) / (front === "franchise" ? goals.cpl_franchise : goals.cpl_condominium)} label="CPL em relação ao alvo" sub={`${money(b.current.cpl)} de ${money(front === "franchise" ? goals.cpl_franchise : goals.cpl_condominium)} · abaixo é melhor`} color="var(--green)" /></div>
        </section>
        <section className="panel"><div className="panel-head"><div><h3>Criativos campeões</h3></div></div><div className="creative-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>{creatives.map((c, i) => <CreativeCard key={c.id} c={c} rank={i + 1} />)}</div></section>
        <section className="panel"><div className="panel-head"><div><h3>Funil comercial</h3><p>CRM Elo · entrada manual</p></div></div><Funnel stages={crm.stages} color={meta.color} format={integer} dense /></section>
      </div>
    </div>
  );
}

function OrganicSlide({ data }: { data: DashboardData }) {
  const ig = data.instagram;
  const posts = [...data.posts].sort((a, b) => b.engagement_rate * b.reach - a.engagement_rate * a.reach).slice(0, 3);
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 18, minHeight: 0 }}>
      <div className="grid grid-6">
        <Kpi label="Seguidores IG" value={ig.current.followers} previous={ig.previous.followers} format={integer} accent="violet" />
        <Kpi label="Novos seguidores" value={ig.current.new_followers} previous={ig.previous.new_followers} format={integer} accent="violet" />
        <Kpi label="Engajamento" value={ig.current.engagement_rate} previous={ig.previous.engagement_rate} format={percent} accent="gold" />
        <Kpi label="Alcance" value={ig.current.reach} previous={ig.previous.reach} format={compact} accent="navy" />
        <Kpi label="Comentários" value={ig.current.comments} previous={ig.previous.comments} format={integer} accent="sky" />
        <Kpi label="DMs" value={ig.current.dms} previous={ig.previous.dms} format={integer} accent="green" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr", gap: 18, minHeight: 0 }}>
        <div className="post-grid">{posts.map((p, i) => <PostCard key={p.id} p={p} rank={i + 1} />)}</div>
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

function CrmSlide({ data }: { data: DashboardData }) {
  const f = data.crm.franchise;
  const c = data.crm.condominium;
  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 18, minHeight: 0 }}>
      <div className="grid grid-4">
        <Kpi label="Contratos de franquia" value={f.contracts} format={integer} accent="red" hideDelta />
        <Kpi label="Receita em taxa de franquia" value={f.revenue} format={money} accent="green" hideDelta />
        <Kpi label="Lojas em condomínio contratadas" value={c.contracts} format={integer} accent="gold" hideDelta />
        <Kpi label="Pipeline em proposta" value={f.pipeline_value} format={money} accent="sky" hideDelta />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <section className="panel"><div className="panel-head"><div><h3>Funil · Franquias</h3></div><span className="badge sky">CRM Elo · entrada manual</span></div><Funnel stages={f.stages} color="var(--red)" format={integer} dense /></section>
        <section className="panel"><div className="panel-head"><div><h3>Funil · Condomínios</h3></div><span className="badge sky">CRM Elo · entrada manual</span></div><Funnel stages={c.stages} color="var(--gold)" format={integer} dense /></section>
      </div>
    </div>
  );
}

export function PresentationNumber({ value }: { value: number }) { return <AnimatedNumber value={value} format={integer} />; }
