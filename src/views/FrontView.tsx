import { ArrowRight, Eye, MousePointerClick, Percent, Target, Wallet, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnimatedNumber, BarList, ChartTip, Delta, Funnel, Kpi, Pacing, Panel, Segmented, useTilt } from "../components/ui/primitives";
import { demoCrm } from "../data/demo";
import { compact, integer, money, percent, shortDate } from "../lib/format";
import { useGoals } from "../lib/goals";
import { byChannel, dailySeries, monthProgress, totals, weeklySeries } from "../lib/metrics";
import { frontMeta, useChartColors, type DashboardData } from "../lib/use-dashboard";
import type { AppView, CampaignRow, Creative, DateRange, Front } from "../types";
import { MiniStat } from "./Executive";

type SortKey = keyof Pick<CampaignRow, "spend" | "leads" | "cpl" | "ctr" | "clicks" | "impressions" | "name">;

export function FrontView({ front, data, range, onNavigate }: { front: Front; data: DashboardData; range: DateRange; onNavigate: (v: AppView) => void }) {
  const meta = frontMeta[front];
  const colors = useChartColors();
  const [goals] = useGoals();
  const bundle = data[front];
  const { current, rows, prevRows } = bundle;
  const [chartMode, setChartMode] = useState<"daily" | "weekly">("daily");
  const [channelFilter, setChannelFilter] = useState<"all" | "meta_ads" | "google_ads">("all");
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
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "leads", dir: "desc" });
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
  const campaigns = useMemo(() => {
    const list = data.campaigns.filter((c) => c.front === front && (channelFilter === "all" || c.channel === channelFilter));
    return [...list].sort((a, b) => {
      const av = a[sort.key]; const bv = b[sort.key];
      if (av == null) return 1; if (bv == null) return -1;
      const r = typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
      return sort.dir === "asc" ? r : -r;
    });
  }, [data.campaigns, front, channelFilter, sort]);
  const creatives = useMemo(() => data.creatives.filter((c) => c.front === front).sort((a, b) => b.leads - a.leads), [data.creatives, front]);
  const crm = useMemo(() => demoCrm(front, current.leads), [front, current.leads]);
  const accentHex = front === "franchise" ? colors.red : colors.gold;
  const chartData = chartMode === "daily"
    ? series.map((d) => ({ label: shortDate(d.date), Leads: d.leads, CPL: d.cpl, Investimento: d.spend }))
    : weeks.map((w) => ({ label: `sem. ${w.label}`, Leads: w.leads, CPL: w.cpl, Investimento: w.spend }));
  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const th = (key: SortKey, label: string, wide = false) => <th className={wide ? "wide" : ""}><button type="button" className={sort.key === key ? "active-sort" : ""} onClick={() => toggleSort(key)}>{label}{sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}</button></th>;

  return (
    <div className="view-enter" key={front}>
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: meta.color }} />{meta.description}</span>
          <h1>{front === "franchise" ? <>Candidatos a franqueado, <em>do clique ao contrato</em></> : <>Indicações de condomínios, <em>do síndico à loja</em></>}</h1>
          <p>{front === "franchise" ? "Meta Ads e Google Ads trabalhando os 6 avatares e o lookalike de condomínios mapeados. Resultado abaixo é lead registrado no formulário com UTM." : "Campanhas para síndicos, administradoras e moradores das capitais prioritárias. Resultado abaixo é indicação registrada no formulário com UTM."}</p>
        </div>
        <Segmented value={channelFilter} onChange={setChannelFilter} options={[{ id: "all", label: "Meta + Google" }, { id: "meta_ads", label: "Meta Ads" }, { id: "google_ads", label: "Google Ads" }]} />
      </div>

      <div className="grid grid-6">
  <Kpi label="Investimento" value={filteredCurrent.spend} previous={filteredPrevious.spend} format={money} accent={meta.accent} icon={<Wallet size={16} />} spark={series.map((d) => d.spend)} />
  <Kpi label={`Leads (${meta.leadWord})`} value={filteredCurrent.leads} previous={filteredPrevious.leads} format={integer} accent={meta.accent} icon={<Target size={16} />} spark={series.map((d) => d.leads)} />
  <Kpi label="Custo por lead" value={filteredCurrent.cpl} previous={filteredPrevious.cpl} format={money} accent="green" icon={<Zap size={16} />} lowerIsBetter spark={series.map((d) => d.cpl ?? 0)} />
  <Kpi label="Conversão clique → lead" value={filteredCurrent.conv_rate} previous={filteredPrevious.conv_rate} format={percent} accent="sky" icon={<Percent size={16} />} />
  <Kpi label="Cliques" value={filteredCurrent.clicks} previous={filteredPrevious.clicks} format={integer} accent="navy" icon={<MousePointerClick size={16} />} spark={series.map((d) => d.clicks)} />
  <Kpi label="Impressões" value={filteredCurrent.impressions} previous={filteredPrevious.impressions} format={compact} accent="navy" icon={<Eye size={16} />} spark={series.map((d) => d.impressions)} />
</div>

      <div className="grid grid-hero" style={{ marginTop: 14 }}>
        <Panel title="Leads e custo por lead ao longo do tempo" description="Barras são leads, a linha é o CPL do dia" actions={<Segmented value={chartMode} onChange={setChartMode} options={[{ id: "daily", label: "Diário" }, { id: "weekly", label: "Semanal" }]} />}>
          <div className="chart-box h-320">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10.5 }} dy={8} minTickGap={22} />
                <YAxis yAxisId="l" tickLine={false} axisLine={false} width={40} tick={{ fill: colors.tick, fontSize: 10 }} />
                <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={58} tick={{ fill: colors.tick, fontSize: 10 }} tickFormatter={(v) => money(Number(v)).replace(",00", "")} />
                <Tooltip content={<ChartTip format={(n, k) => (k === "Leads" ? integer(n) : money(n))} />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar yAxisId="l" dataKey="Leads" fill={accentHex} radius={[6, 6, 0, 0]} maxBarSize={26} isAnimationActive animationDuration={1200} />
                <Line yAxisId="r" type="monotone" dataKey="CPL" stroke={colors.green} strokeWidth={2.5} dot={false} isAnimationActive animationDuration={1600} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: accentHex }} />Leads</span><span><i style={{ background: colors.green }} />Custo por lead</span></div>
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

      <div className="section-title"><div><h2>Campanhas</h2><p>Ordene por qualquer coluna. Nomes seguem o padrão MG | objetivo | segmentação.</p></div><span className="badge ghost">{campaigns.length} campanhas</span></div>
      <div className="table-wrap">
        <div className="desktop-table">
          <table>
            <thead><tr>{th("name", "Campanha", true)}<th>Canal</th><th>Status</th>{th("spend", "Investimento")}{th("impressions", "Impressões")}{th("clicks", "Cliques")}{th("ctr", "CTR")}{th("leads", "Leads")}{th("cpl", "CPL")}</tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="name-cell"><div className="entity-name"><span><strong>{c.name}</strong><small>{c.objective}</small></span></div></td>
                  <td><span className={`chip ${c.channel === "meta_ads" ? "meta" : "google"}`}>{c.channel === "meta_ads" ? "Meta" : "Google"}</span></td>
                  <td><span className={`status ${c.status}`}><i />{c.status === "ACTIVE" ? "Ativa" : c.status === "LEARNING" ? "Aprendizado" : "Pausada"}</span></td>
                  <td>{money(c.spend)}</td><td>{integer(c.impressions)}</td><td>{integer(c.clicks)}</td><td>{percent(c.ctr)}</td><td><b style={{ color: "var(--text)" }}>{integer(c.leads)}</b></td><td>{money(c.cpl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-rows">
          {campaigns.map((c) => (
            <div className="mobile-row" key={c.id}>
              <div className="mobile-primary"><strong>{c.name}</strong><b>{integer(c.leads)} leads</b></div>
              <div className="mobile-details"><span>Invest. <b>{money(c.spend)}</b></span><span>CPL <b>{money(c.cpl)}</b></span><span>CTR <b>{percent(c.ctr)}</b></span><span>Cliques <b>{integer(c.clicks)}</b></span></div>
            </div>
          ))}
        </div>
        <p className="table-count">{campaigns.length} campanhas · {integer(campaigns.reduce((s, c) => s + c.leads, 0))} leads</p>
      </div>

      <div className="section-title"><div><h2>Criativos que mais geram leads</h2><p>Ranking por leads no período. Passe o mouse para o efeito de profundidade.</p></div></div>
      <div className="creative-grid">
        {creatives.slice(0, 8).map((c, i) => <CreativeCard key={c.id} c={c} rank={i + 1} />)}
      </div>

      <div className="grid grid-wide" style={{ marginTop: 28 }}>
        <Panel title={`Funil comercial · ${meta.short}`} description="Do lead ao contrato, com as taxas entre etapas" badge={<span className="badge sky">CRM Elo · ilustrativo</span>}>
          <Funnel stages={crm.stages} color={meta.color} format={integer} dense />
        </Panel>
        <Panel title="Onde os leads entram" description="Participação de cada origem no funil">
          <BarList items={crm.sources.map((s, i) => ({ name: s.name, value: s.leads, color: [colors.meta, colors.google, colors.instagram, colors.gold][i] }))} format={integer} />
          <button type="button" className="secondary-button" style={{ marginTop: 16, width: "100%" }} onClick={() => onNavigate("crm")}>Abrir CRM e vendas <ArrowRight size={15} /></button>
        </Panel>
      </div>
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

export function CreativeCard({ c, rank }: { c: Creative; rank: number }) {
  const tilt = useTilt<HTMLElement>(7);
  return (
    <article ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className="creative tilt" style={{ "--c1": c.palette[0], "--c2": c.palette[1] } as React.CSSProperties}>
      <div className="creative-art">
        <span className="format">{c.format === "video" ? "Vídeo" : c.format === "carousel" ? "Carrossel" : "Estático"}</span>
        {rank <= 3 && <span className="rank">{rank}</span>}
        <h4>{c.headline}</h4>
      </div>
      <div className="creative-body">
        <small>{c.name}</small>
        <div className="creative-stats">
          <div><b>{integer(c.leads)}</b><span>leads</span></div>
          <div><b>{money(c.cpl).replace(",00", "")}</b><span>CPL</span></div>
          <div><b>{c.hook_rate != null ? percent(c.hook_rate) : percent(c.ctr)}</b><span>{c.hook_rate != null ? "hook" : "CTR"}</span></div>
        </div>
      </div>
    </article>
  );
}
