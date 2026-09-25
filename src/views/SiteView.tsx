import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, MousePointerClick, Percent, Target, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnalyticsAcquisitionTable, AnalyticsEventsTable, AnalyticsLandingPagesTable } from "../components/AnalyticsTables";
import { AnimatedNumber, ChartTip, Kpi, Panel, Segmented, Skeleton } from "../components/ui/primitives";
import { getAllAnalyticsAcquisition, getAllAnalyticsEvents, getAllAnalyticsLandingPages, getSiteOverview } from "../lib/api";
import { compact, integer, percent } from "../lib/format";
import {
  channelPerformance, eventHighlights, siteSeries, topLandingPages,
  type ChannelPerformance, type ChartMode,
} from "../lib/site-analytics";
import { useChartColors } from "../lib/use-dashboard";
import type { AnalyticsLandingPageItem, DateRange } from "../types";

// ---------------------------------------------------------------------------
// Aba Site — leitura executiva do GA4, na ordem em que a pergunta aparece:
// tráfego → qualidade → aquisição → leads → landing pages → comportamento.
//
// Cada seção tem sua própria query, então uma RPC secundária que falhe (landing
// pages, por exemplo) não derruba os KPIs nem o gráfico principal. Todas as
// queries usam o período global do dashboard na chave: trocar o período
// invalida tudo de uma vez, sem card exibindo intervalo antigo.
//
// Nomenclatura: `generate_leads` é "Leads" e `lead_rate` é "Taxa de conversão".
// ---------------------------------------------------------------------------

const chartModes: Array<{ id: ChartMode; label: string }> = [
  { id: "daily", label: "Diário" },
  { id: "weekly", label: "Semanal" },
  { id: "monthly", label: "Mensal" },
];

export function SiteView({ range }: { range: DateRange }) {
  const colors = useChartColors();
  const [chartMode, setChartMode] = useState<ChartMode>("daily");
  const [chartMetric, setChartMetric] = useState<"leads" | "engagement">("leads");
  const [acquisitionOrder, setAcquisitionOrder] = useState<"sessions" | "generate_leads">("sessions");

  const overview = useQuery({ queryKey: ["site-overview", range.start, range.end], queryFn: () => getSiteOverview(range), retry: 1 });
  const acquisition = useQuery({ queryKey: ["site-acquisition", range.start, range.end], queryFn: () => getAllAnalyticsAcquisition(range), retry: 1 });
  const landingPages = useQuery({ queryKey: ["site-landing-pages", range.start, range.end], queryFn: () => getAllAnalyticsLandingPages(range), retry: 1 });
  const events = useQuery({ queryKey: ["site-events", range.start, range.end], queryFn: () => getAllAnalyticsEvents(range), retry: 1 });

  const current = overview.data?.current ?? null;
  const previous = overview.data?.previous ?? null;
  const daily = overview.data?.daily ?? [];
  const hasData = Boolean(current?.has_data);

  const series = useMemo(() => siteSeries(daily, chartMode), [daily, chartMode]);
  const dailySpark = useMemo(() => siteSeries(daily, "daily"), [daily]);
  const channels = useMemo(() => channelPerformance(acquisition.data?.items ?? []), [acquisition.data]);
  const pages = useMemo(() => landingPages.data?.items ?? [], [landingPages.data]);
  const highlights = useMemo(() => eventHighlights(events.data?.items ?? []), [events.data]);

  const chartData = series.map((bucket) => ({
    label: bucket.label,
    Sessões: bucket.sessions,
    Leads: bucket.generate_leads,
    Engajamento: bucket.engagement_rate,
  }));
  const lineKey = chartMetric === "leads" ? "Leads" : "Engajamento";
  const lineColor = chartMetric === "leads" ? colors.gold : colors.green;
  const bucketWord = { daily: "por dia", weekly: "por semana", monthly: "por mês" }[chartMode];

  return (
    <div className="view-enter">
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--sky)" }} />Site · Google Analytics 4</span>
          <h1>O comportamento dos usuários <em>no site</em></h1>
          <p>Tráfego, engajamento, aquisição e geração de leads no período selecionado. Atribuição própria do GA4, separada dos resultados de Meta Ads e Google Ads.</p>
        </div>
      </div>

      {overview.isLoading ? (
        <div className="grid grid-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={132} />)}</div>
      ) : overview.isError ? (
        <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar os dados do site: {(overview.error as Error)?.message ?? "erro desconhecido"}.</div>
      ) : !hasData ? (
        <div className="empty-state">Nenhum dado do site sincronizado para este período.</div>
      ) : (
        <div className="grid grid-6">
          <Kpi label="Sessões" value={current!.sessions} previous={previous?.sessions} format={integer} accent="sky" icon={<Activity size={16} />} spark={dailySpark.map((d) => d.sessions)} />
          <Kpi label="Novos usuários" value={current!.new_users} previous={previous?.new_users} format={integer} accent="violet" icon={<UserPlus size={16} />} spark={dailySpark.map((d) => d.new_users)} />
          <Kpi label="Sessões engajadas" value={current!.engaged_sessions} previous={previous?.engaged_sessions} format={integer} accent="green" icon={<MousePointerClick size={16} />} spark={dailySpark.map((d) => d.engaged_sessions)} />
          <Kpi label="Taxa de engajamento" value={current!.engagement_rate ?? null} previous={previous?.engagement_rate ?? null} format={percent} accent="navy" icon={<Percent size={16} />} />
          <Kpi label="Leads" value={current!.generate_leads} previous={previous?.generate_leads} format={integer} accent="red" icon={<Target size={16} />} spark={dailySpark.map((d) => d.generate_leads)} />
          <Kpi label="Taxa de conversão" value={current!.lead_rate ?? null} previous={previous?.lead_rate ?? null} format={percent} accent="gold" icon={<Percent size={16} />} />
        </div>
      )}

      <div className="grid grid-hero" style={{ marginTop: 14 }}>
        <Panel
          title="Tráfego e geração de leads"
          description={`Barras são sessões, a linha é ${chartMetric === "leads" ? "o total de leads" : "a taxa de engajamento"} ${bucketWord}`}
          actions={
            <div className="panel-controls">
              <Segmented value={chartMetric} onChange={setChartMetric} options={[{ id: "leads", label: "Leads" }, { id: "engagement", label: "Engajamento" }]} />
              <Segmented value={chartMode} onChange={setChartMode} options={chartModes} />
            </div>
          }
          noTilt
        >
          {overview.isLoading ? <Skeleton height={320} /> : overview.isError ? (
            <div className="inline-error"><AlertCircle size={17} />Série indisponível neste momento.</div>
          ) : !chartData.length ? (
            <div className="empty-state">Sem série diária do site para este período.</div>
          ) : (
            <>
              <div className="chart-box h-320" data-testid="site-traffic-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={colors.grid} vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10.5 }} dy={8} minTickGap={22} />
                    <YAxis yAxisId="l" tickLine={false} axisLine={false} width={46} tick={{ fill: colors.tick, fontSize: 10 }} tickFormatter={(v) => compact(Number(v))} />
                    <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={46} tick={{ fill: colors.tick, fontSize: 10 }} tickFormatter={(v) => (chartMetric === "leads" ? integer(Number(v)) : `${Math.round(Number(v))}%`)} />
                    <Tooltip content={<ChartTip format={(n, k) => (k === "Engajamento" ? percent(n) : integer(n))} />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                    <Bar yAxisId="l" dataKey="Sessões" fill={colors.sky} radius={[6, 6, 0, 0]} maxBarSize={26} isAnimationActive animationDuration={1200} />
                    <Line yAxisId="r" type="monotone" dataKey={lineKey} stroke={lineColor} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={1600} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="legend" style={{ marginTop: 8 }}>
                <span><i style={{ background: colors.sky }} />Sessões</span>
                <span><i style={{ background: lineColor }} />{chartMetric === "leads" ? "Leads" : "Taxa de engajamento"}</span>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Performance por canal" description="Volume, qualidade e leads de cada canal do GA4" noTilt>
          {acquisition.isLoading ? <Skeleton height={320} /> : acquisition.isError ? (
            <div className="inline-error"><AlertCircle size={17} />Canais indisponíveis: {(acquisition.error as Error)?.message ?? "erro desconhecido"}.</div>
          ) : !channels.length ? (
            <div className="empty-state">Nenhum canal com sessões neste período.</div>
          ) : (
            <div className="channel-list" data-testid="site-channel-performance">
              {channels.slice(0, 6).map((channel) => <ChannelRow key={channel.channel} channel={channel} max={channels[0].sessions} color={colors.sky} leadColor={colors.gold} />)}
            </div>
          )}
        </Panel>
      </div>

      <div className="section-title">
        <div><h2>Aquisição</h2><p>De onde vêm as sessões e os leads do site.</p></div>
        <Segmented
          value={acquisitionOrder}
          onChange={setAcquisitionOrder}
          options={[{ id: "sessions", label: "Por sessões" }, { id: "generate_leads", label: "Por leads" }]}
        />
      </div>
      {acquisition.isLoading ? <Skeleton height={300} /> : acquisition.isError ? (
        <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar a aquisição: {(acquisition.error as Error)?.message ?? "erro desconhecido"}.</div>
      ) : (
        <>
          <AnalyticsAcquisitionTable items={acquisition.data!.items} orderBy={acquisitionOrder} />
          {acquisition.data!.truncated && <p className="manual-foot">A leitura da aquisição atingiu o limite de segurança e pode estar incompleta. Reduza o período para ver todas as origens.</p>}
        </>
      )}

      <div className="section-title"><div><h2>Landing pages</h2><p>As páginas pelas quais os usuários iniciaram a visita ao site.</p></div></div>
      {landingPages.isLoading ? (
        <div className="grid grid-wide"><Skeleton height={260} /><Skeleton height={260} /></div>
      ) : landingPages.isError ? (
        <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar as landing pages: {(landingPages.error as Error)?.message ?? "erro desconhecido"}.</div>
      ) : (
        <>
          <Panel title="Top landing pages" description="As 5 páginas de entrada com mais sessões no período" noTilt>
            <TopLandingPages items={pages} color={colors.sky} />
          </Panel>
          <div style={{ marginTop: 14 }}>
            <AnalyticsLandingPagesTable items={pages} />
          </div>
          {landingPages.data!.truncated && <p className="manual-foot">A leitura das landing pages atingiu o limite de segurança e pode estar incompleta. Reduza o período para ver todas as páginas.</p>}
        </>
      )}

      <div className="section-title"><div><h2>Eventos do site</h2><p>O que os usuários fizeram dentro das páginas.</p></div></div>
      {events.isLoading ? (
        <>
          <div className="grid grid-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={108} />)}</div>
          <div style={{ marginTop: 14 }}><Skeleton height={280} /></div>
        </>
      ) : events.isError ? (
        <div className="inline-error"><AlertCircle size={17} />Não foi possível carregar os eventos: {(events.error as Error)?.message ?? "erro desconhecido"}.</div>
      ) : (
        <>
          {highlights.length > 0 && (
            <div className="grid grid-4" data-testid="site-event-highlights">
              {highlights.map((highlight) => (
                <Panel key={highlight.event_name} className="tight" noTilt>
                  <div className="event-highlight">
                    <span className="ic" style={{ color: highlight.isLead ? colors.red : colors.sky, background: `color-mix(in srgb, ${highlight.isLead ? colors.red : colors.sky} 15%, transparent)` }}>
                      {highlight.isLead ? <Target size={16} /> : <Activity size={16} />}
                    </span>
                    <small>{highlight.label}</small>
                    <strong><AnimatedNumber value={highlight.count} format={integer} /></strong>
                    <em>{compact(highlight.daily_average)} por dia{highlight.share_of_total != null ? ` · ${percent(highlight.share_of_total)} dos eventos` : ""}</em>
                  </div>
                </Panel>
              ))}
            </div>
          )}
          <div style={{ marginTop: highlights.length > 0 ? 14 : 0 }}>
            <AnalyticsEventsTable items={events.data!.items} />
          </div>
          {events.data!.truncated && <p className="manual-foot">A leitura dos eventos atingiu o limite de segurança e pode estar incompleta. Reduza o período para ver todos os eventos.</p>}
        </>
      )}
    </div>
  );
}

/** Uma linha do painel de canais: barra de volume + qualidade e leads embaixo. */
function ChannelRow({ channel, max, color, leadColor }: { channel: ChannelPerformance; max: number; color: string; leadColor: string }) {
  const width = max ? Math.max(2, (channel.sessions / max) * 100) : 0;
  return (
    <div className="channel-row">
      <div className="channel-top">
        <strong>{channel.channel}</strong>
        <b>{integer(channel.sessions)} <span>sessões</span></b>
      </div>
      <div className="channel-track"><span style={{ width: `${width}%`, background: color }} /></div>
      <div className="channel-foot">
        <span><i style={{ background: color }} />{percent(channel.engagement_rate)} engajamento</span>
        <span><i style={{ background: leadColor }} />{integer(channel.generate_leads)} leads</span>
        <span>{percent(channel.lead_rate)} conversão</span>
      </div>
    </div>
  );
}

function TopLandingPages({ items, color }: { items: AnalyticsLandingPageItem[]; color: string }) {
  const top = useMemo(() => topLandingPages(items, 5), [items]);
  if (!top.length) return <div className="empty-state">Nenhuma landing page com sessões neste período.</div>;
  const max = top[0].sessions || 1;
  return (
    <div className="channel-list" data-testid="site-top-landing-pages">
      {top.map((page) => (
        <div className="channel-row" key={page.landing_page}>
          <div className="channel-top">
            <strong title={page.landing_page}>{page.landing_page}</strong>
            <b>{integer(page.sessions)} <span>sessões</span></b>
          </div>
          <div className="channel-track"><span style={{ width: `${Math.max(2, (page.sessions / max) * 100)}%`, background: color }} /></div>
          <div className="channel-foot">
            <span><i style={{ background: color }} />{percent(page.engagement_rate)} engajamento</span>
            <span>{percent(page.session_share)} das sessões</span>
          </div>
        </div>
      ))}
    </div>
  );
}

