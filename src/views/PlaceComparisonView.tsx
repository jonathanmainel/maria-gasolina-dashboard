import { ArrowLeft, ArrowLeftRight, Info, Target, Wallet, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CampaignTable } from "../components/CampaignTable";
import { ChartTip, Kpi, Panel, Segmented } from "../components/ui/primitives";
import type { ChannelFilter } from "../lib/detail-rows";
import { commercialFronts, isPlaceFront, placeFrontIds, type PlaceFront } from "../lib/fronts";
import { integer, money, shortDate } from "../lib/format";
import { comparablePlaceSeries, comparisonStatusLabel, getPlaceComparisonSnapshot, type PlaceComparisonSnapshot } from "../lib/place-comparison";
import { useChartColors, type DashboardData } from "../lib/use-dashboard";
import type { DateRange } from "../types";

interface Props {
  origin: PlaceFront;
  data?: DashboardData;
  range: DateRange;
  channelFilter: ChannelFilter;
  onChannelChange: (channel: ChannelFilter) => void;
  onClose: () => void;
}

export function PlaceComparisonView({ origin, data, range, channelFilter, onChannelChange, onClose }: Props) {
  const [first, setFirst] = useState<PlaceFront>(origin);
  const [second, setSecond] = useState<PlaceFront>(() => placeFrontIds.find((front) => front !== origin)!);
  const [detailSide, setDetailSide] = useState<"a" | "b">("a");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const a = useMemo(() => getPlaceComparisonSnapshot(first, data, channelFilter), [first, data, channelFilter]);
  const b = useMemo(() => getPlaceComparisonSnapshot(second, data, channelFilter), [second, data, channelFilter]);
  const selected = detailSide === "a" ? a : b;
  const name = (front: PlaceFront) => commercialFronts[front].short;
  const selector = (id: "a" | "b", value: PlaceFront, other: PlaceFront, change: (front: PlaceFront) => void) => (
    <div className="place-front-selector">
      <label htmlFor={`place-front-${id}`}>Frente {id.toUpperCase()}</label>
      <select id={`place-front-${id}`} value={value} onChange={(event) => { const next = event.currentTarget.value; if (isPlaceFront(next) && next !== other) change(next); }}>
        {placeFrontIds.map((front) => <option key={front} value={front} disabled={front === other}>{name(front)}</option>)}
      </select>
    </div>
  );
  return <div className="view-enter place-comparison" data-testid="place-comparison">
    <div className="view-head">
      <div><span className="eyebrow"><i style={{ background: "var(--gold)" }} />Places</span><h1 ref={heading} tabIndex={-1}>Comparar frentes</h1><p>{shortDate(range.start)} a {shortDate(range.end)} · mesmo período e filtro de plataforma para as duas frentes.</p></div>
      <button type="button" className="secondary-button" onClick={onClose}><ArrowLeft size={16} />Encerrar comparação</button>
    </div>
    <div className="place-comparison-toolbar">
      <div className="place-comparison-selectors">{selector("a", first, second, setFirst)}<ArrowLeftRight size={19} aria-hidden="true" />{selector("b", second, first, setSecond)}</div>
      <Segmented value={channelFilter} onChange={onChannelChange} options={[{ id: "all", label: "Visão geral" }, { id: "meta_ads", label: "Meta Ads" }, { id: "google_ads", label: "Google Ads" }]} />
    </div>
    <div className="place-comparison-labels" aria-live="polite">
      {[a, b].map((snapshot, index) => <div key={index} data-testid={`comparison-front-${index === 0 ? "a" : "b"}`}><h2>Frente {index === 0 ? "A" : "B"} · {name(snapshot.front)}</h2><p>{comparisonStatusLabel(snapshot)}</p></div>)}
    </div>
    <div className="place-comparison-kpis">
      {([
        { label: "Investimento", key: "spend", format: money, icon: Wallet },
        { label: "Leads", key: "leads", format: integer, icon: Target },
        { label: "CPL", key: "cpl", format: money, icon: Zap },
      ] as const).map((metric) => <div className="place-comparison-pair" key={metric.key}>
        {[a, b].map((snapshot, index) => <div key={index} role="group" aria-label={`${metric.label} · Frente ${index === 0 ? "A" : "B"} · ${name(snapshot.front)}`}>
          <Kpi label={metric.label} value={snapshot.metrics?.[metric.key] ?? null} format={metric.format} accent={index === 0 ? "gold" : "sky"} icon={<metric.icon size={16} />} hideDelta foot={name(snapshot.front)} />
        </div>)}
      </div>)}
    </div>
    <div className="demo-note" role="status"><Info size={15} /><span>Este modo apresenta os dados disponíveis de cada frente. Diferenças percentuais e conclusões comparativas não são calculadas.</span></div>
    <ComparisonEvolution first={a} second={b} />
    <Panel title="Campanhas por frente" description="Um detalhamento por vez, no mesmo período e plataforma" noTilt>
      <Segmented value={detailSide} onChange={setDetailSide} options={[{ id: "a", label: `Frente A · ${name(first)}` }, { id: "b", label: `Frente B · ${name(second)}` }]} />
      <div className="place-comparison-campaigns" aria-live="polite">
        <h4>{name(selected.front)}</h4>
        {selected.status === "loading" || selected.status === "error" ? <div className="empty-state">{comparisonStatusLabel(selected)}</div> : <CampaignTable key={selected.front} campaigns={selected.campaigns} emptyLabel="Nenhuma campanha vinculada." resetToken={`${selected.front}|${channelFilter}|${range.start}|${range.end}`} />}
      </div>
    </Panel>
  </div>;
}

export function ComparisonEvolution({ first, second }: { first: PlaceComparisonSnapshot; second: PlaceComparisonSnapshot }) {
  const colors = useChartColors();
  const series = comparablePlaceSeries(first, second);
  return <Panel title="Evolução de desempenho" description="Leads por dia · duas séries no mesmo período" noTilt>
    {!series.length ? <div className="empty-state">A comparação temporal será exibida quando houver duas séries disponíveis com a mesma cobertura de datas.</div> : <>
      <div className="chart-box h-320"><ResponsiveContainer width="100%" height="100%"><LineChart data={series}>
        <CartesianGrid stroke={colors.grid} vertical={false} /><XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTip format={integer} />} />
        <Line type="linear" dataKey="a" name={commercialFronts[first.front].short} stroke={colors.gold} dot={false} connectNulls={false} />
        <Line type="linear" dataKey="b" name={commercialFronts[second.front].short} stroke={colors.sky} dot={false} connectNulls={false} />
      </LineChart></ResponsiveContainer></div>
      <div className="legend"><span><i style={{ background: colors.gold }} />{commercialFronts[first.front].short}</span><span><i style={{ background: colors.sky }} />{commercialFronts[second.front].short}</span></div>
    </>}
  </Panel>;
}
