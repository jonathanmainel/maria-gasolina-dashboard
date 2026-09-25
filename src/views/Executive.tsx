import { AlertTriangle, ArrowRight, BadgeDollarSign, FileSignature, PiggyBank, Target, UserPlus, Wallet, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnimatedNumber, BarList, ChartTip, Delta, Kpi, Pacing, Panel, Segmented, Sparkline, useTilt } from "../components/ui/primitives";
import { NetworkHero } from "../components/NetworkHero";
import { compact, integer, money, percent, shortDate } from "../lib/format";
import { useGoals } from "../lib/goals";
import { dailySeries, monthProgress } from "../lib/metrics";
import { frontMeta, useChartColors, type DashboardData } from "../lib/use-dashboard";
import type { AppView, DateRange } from "../types";

export function ExecutiveView({ data, range, onNavigate }: { data: DashboardData; range: DateRange; onNavigate: (v: AppView) => void }) {
  const goals = useGoals();
  const colors = useChartColors();
  const [metric, setMetric] = useState<"leads" | "spend" | "cpl">("leads");
  const organicTilt = useTilt<HTMLElement>(6);
  const { all, franchise, condominium, instagram, facebook, delivery } = data;
  const series = useMemo(() => dailySeries(data.current), [data.current]);
  const month = monthProgress(range);
  const monthRows = useMemo(() => data.current.filter((r) => r.date.slice(0, 7) === range.end.slice(0, 7)), [data.current, range.end]);
  const monthSpend = monthRows.reduce((s, r) => s + r.spend, 0);
  const monthLeadsF = monthRows.filter((r) => r.front === "franchise").reduce((s, r) => s + r.leads, 0);
  const monthLeadsC = monthRows.filter((r) => r.front === "condominium").reduce((s, r) => s + r.leads, 0);
  const newFollowers = instagram.current.new_followers + facebook.current.new_followers;
  const prevFollowers = instagram.previous.new_followers + facebook.previous.new_followers;
  const sparkSpend = series.map((d) => d.spend);
  const sparkLeads = series.map((d) => d.leads);
  const sparkCpl = series.map((d) => d.cpl ?? 0);
  const orgSpark = useMemo(() => {
    const m = new Map<string, number>();
    data.organicRows.forEach((r) => m.set(r.date, (m.get(r.date) ?? 0) + r.new_followers));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [data.organicRows]);
  const chartData = series.map((d) => ({ label: shortDate(d.date), Franquias: metric === "leads" ? d.franchise : metric === "spend" ? d.spend_franchise : d.franchise ? d.spend_franchise / d.franchise : null, Condomínios: metric === "leads" ? d.condominium : metric === "spend" ? d.spend_condominium : d.condominium ? d.spend_condominium / d.condominium : null }));
  const fmt = (n: number) => (metric === "leads" ? integer(n) : money(n));
  const channelMix = [
    { name: "Meta Ads", value: data.current.filter((r) => r.channel === "meta_ads").reduce((s, r) => s + r.leads, 0), color: colors.meta, hint: money(data.current.filter((r) => r.channel === "meta_ads").reduce((s, r) => s + r.spend, 0)) },
    { name: "Google Ads", value: data.current.filter((r) => r.channel === "google_ads").reduce((s, r) => s + r.leads, 0), color: colors.google, hint: money(data.current.filter((r) => r.channel === "google_ads").reduce((s, r) => s + r.spend, 0)) },
    { name: "Orgânico (DMs + perfil)", value: instagram.current.dms + facebook.current.dms, color: colors.violet, hint: "sem custo de mídia" },
  ];

  // Tendências: metade recente do período contra a metade anterior, para enxergar
  // evolução ou regressão sem esperar a virada do período de comparação completo.
  const split = (arr: number[]) => { const n = arr.length; const half = Math.floor(n / 2); return [arr.slice(0, n - half), arr.slice(n - half)] as const; };
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0);
  const [spendA, spendB] = split(sparkSpend);
  const [leadsA, leadsB] = split(sparkLeads);
  const [cplA, cplB] = split(sparkCpl.filter((v) => v > 0));
  const [followA, followB] = split(orgSpark);

  // Vendas. Dois blocos de natureza diferente, que o dashboard não mistura:
  // o resultado do período (contratos e receita, informados) e a foto do kanban
  // (oportunidades paradas em cada etapa hoje). Não existe aqui conversão
  // lead → contrato nem projeção de receita: o estoque do kanban não sustenta
  // nenhuma das duas, e os leads de mídia do período não são o denominador dos
  // contratos fechados nele (quem fechou hoje entrou meses atrás).
  const crmFranchise = data.crm.franchise;
  const crmCondominium = data.crm.condominium;
  const salesContracts = crmFranchise.contracts + crmCondominium.contracts;
  const salesRevenue = crmFranchise.revenue + crmCondominium.revenue;
  const salesOpen = crmFranchise.open_opportunities + crmCondominium.open_opportunities;
  const openByStage = crmFranchise.stages.filter((stage) => stage.kind === "commercial" && stage.count > 0);

  return (
    <div className="view-enter">
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--gold)" }} />Maria Gasolina Express · {shortDate(range.start)} a {shortDate(range.end)}</span>
          <h1>O crescimento da rede, <em>em uma tela</em></h1>
          <p>Expansão de franquias, captação de condomínios e presença orgânica lado a lado, com o ritmo do mês contra as metas.</p>
        </div>
      </div>

      {data.unclassified.campaigns.length > 0 && (
        <div className="demo-note">
          <AlertTriangle size={16} />
          <span>
            <b>{integer(data.unclassified.campaigns.length)} campanha(s) fora do padrão de nomenclatura</b> não puderam ser atribuídas a
            nenhuma frente e ficaram de fora dos números acima ({money(data.unclassified.spend)} de investimento, {integer(data.unclassified.leads)} leads).
            Inclua "FRANQUIA" ou "CONDOMÍNIO" no nome da campanha para que ela entre na frente certa.
          </span>
        </div>
      )}

      <div className="grid grid-4">
        <Kpi label="Investimento em mídia" value={all.current.spend} previous={all.previous.spend} format={money} accent="red" icon={<Wallet size={17} />} spark={sparkSpend} />
        <Kpi label="Leads gerados (todas as frentes)" value={all.current.leads} previous={all.previous.leads} format={integer} accent="gold" icon={<Target size={17} />} spark={sparkLeads} />
        <Kpi label="Custo por lead médio" value={all.current.cpl} previous={all.previous.cpl} format={money} accent="green" icon={<Zap size={17} />} lowerIsBetter spark={sparkCpl} />
        <Kpi label="Novos seguidores (IG + FB)" value={newFollowers} previous={prevFollowers} format={integer} accent="violet" icon={<UserPlus size={17} />} spark={orgSpark} />
      </div>

      <div className="grid grid-hero" style={{ marginTop: 14 }}>
        <NetworkHero />
        <Panel title="Ritmo do mês contra as metas" description={`Dia ${month.elapsed} de ${month.daysInMonth} · metas editáveis em Metas e ajustes`}>
          <div className="pacing-list">
            <Pacing label="Verba de mídia" actual={monthSpend} goal={goals.media_budget} ratio={month.ratio} color="var(--red)" format={money} lowerIsBetter />
            <Pacing label="Leads · Franquias" actual={monthLeadsF} goal={goals.leads_franchise} ratio={month.ratio} color="var(--red)" format={integer} />
            <Pacing label="Leads · Condomínios" actual={monthLeadsC} goal={goals.leads_condominium} ratio={month.ratio} color="var(--gold)" format={integer} />
            <Pacing label="Posts publicados" actual={delivery.posts_published} goal={goals.posts} ratio={month.ratio} color="var(--violet)" format={integer} />
            <Pacing label="Stories publicados" actual={delivery.stories_published} goal={goals.stories} ratio={month.ratio} color="var(--violet)" format={integer} />
          </div>
        </Panel>
      </div>

      <div className="section-title" style={{ marginTop: 22 }}>
        <div><h2>Tendências</h2><p>Metade recente do período contra a metade anterior — evolução ou regressão de cada indicador, sem esperar o fim do mês.</p></div>
      </div>
      {/* Só indicadores com série diária real. Contratos e receita saíram daqui:
          são um número único do período informado, sem histórico mensal no CRM
          para comparar — a série anterior vinha de leads × taxa do funil. */}
      <div className="grid grid-4">
        <Kpi label="Investimento" value={sum(spendB)} previous={sum(spendA)} format={money} accent="red" icon={<Wallet size={15} />} spark={sparkSpend} foot="metade recente vs. anterior" lowerIsBetter />
        <Kpi label="Leads" value={sum(leadsB)} previous={sum(leadsA)} format={integer} accent="gold" icon={<Target size={15} />} spark={sparkLeads} foot="metade recente vs. anterior" />
        <Kpi label="Custo por lead" value={avg(cplB)} previous={avg(cplA)} format={money} accent="green" icon={<Zap size={15} />} spark={sparkCpl} foot="média: recente vs. anterior" lowerIsBetter />
        <Kpi label="Novos seguidores" value={sum(followB)} previous={sum(followA)} format={integer} accent="violet" icon={<UserPlus size={15} />} spark={orgSpark} foot="metade recente vs. anterior" />
      </div>

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        <FrontCard front="franchise" totals={franchise.current} previous={franchise.previous} spark={dailySeries(franchise.rows).map((d) => d.leads)} onClick={() => onNavigate("franchise")} />
        <FrontCard front="condominium" totals={condominium.current} previous={condominium.previous} spark={dailySeries(condominium.rows).map((d) => d.leads)} onClick={() => onNavigate("condominium")} />
        <article ref={organicTilt.ref} onMouseMove={organicTilt.onMouseMove} onMouseLeave={organicTilt.onMouseLeave} className="front-card tilt organic" onClick={() => onNavigate("organic")} role="link" tabIndex={0}>
          <div className="front-card-head"><h3><i />Orgânico · Instagram e Facebook</h3><ArrowRight size={18} /></div>
          <div className="front-main"><strong><AnimatedNumber value={instagram.current.followers + facebook.current.followers} format={compact} /></strong><small>seguidores somados</small></div>
          <Sparkline className="front-spark" points={orgSpark} color="#9b7bff" />
          <div className="front-meta">
            <div><small>Novos seguidores</small><b>{integer(newFollowers)}</b></div>
            <div><small>Engajamento IG</small><b>{percent(instagram.current.engagement_rate)}</b></div>
            <div><small>DMs recebidas</small><b>{integer(instagram.current.dms + facebook.current.dms)}</b></div>
          </div>
        </article>
      </div>

      <div className="section-title" style={{ marginTop: 22 }}>
        <div><h2>Vendas</h2><p>Resultado informado do período e pipeline parado hoje no CRM Elo — dois números de naturezas diferentes, lado a lado sem se misturarem.</p></div>
        <span className="badge sky">CRM Elo · entrada manual</span>
      </div>
      <div className="grid grid-4">
        <Kpi label="Contratos no período" value={salesContracts} format={integer} hideDelta accent="sky" icon={<FileSignature size={16} />} foot={`${crmFranchise.contracts} franquias · ${crmCondominium.contracts} condomínios`} />
        <Kpi label="Receita no período" value={salesRevenue > 0 ? salesRevenue : null} format={money} accent="green" icon={<BadgeDollarSign size={16} />} hideDelta foot={salesRevenue > 0 ? "informada nas duas frentes" : "informe em CRM e vendas"} />
        <Kpi label="Oportunidades abertas" value={salesOpen} format={integer} accent="gold" icon={<PiggyBank size={16} />} hideDelta foot={`${crmFranchise.open_opportunities} franquias · ${crmCondominium.open_opportunities} condomínios`} />
        <Kpi label="Ticket médio · franquias" value={crmFranchise.avg_ticket > 0 ? crmFranchise.avg_ticket : null} format={money} accent="red" icon={<Target size={16} />} hideDelta foot={crmFranchise.avg_ticket_realized ? "realizado: receita ÷ contratos" : "referência informada"} />
      </div>
      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        <Panel title="Pipeline aberto por etapa · Franquias" description="Oportunidades paradas em cada coluna do kanban hoje. É estoque: a diferença entre duas colunas não é perda de uma para a outra.">
          {openByStage.length ? (
            <BarList items={openByStage.map((stage) => ({ name: stage.name, value: stage.count, color: colors.red }))} format={integer} />
          ) : (
            <div className="empty-state">Nenhuma oportunidade aberta informada.</div>
          )}
        </Panel>
        <Panel className="fill-body" title="Resultado do período" description="Contratos fechados e receita informados para o período de referência">
          {salesContracts > 0 || salesRevenue > 0 ? (
            <div className="proj-compare">
              <div className="proj-bar"><span>Franquias</span><div className="proj-track"><div className="proj-fill won" style={{ width: `${Math.min(100, salesContracts > 0 ? (crmFranchise.contracts * 100) / salesContracts : 0)}%` }} /></div><b>{integer(crmFranchise.contracts)}</b></div>
              <div className="proj-bar"><span>Condomínios</span><div className="proj-track"><div className="proj-fill won" style={{ width: `${Math.min(100, salesContracts > 0 ? (crmCondominium.contracts * 100) / salesContracts : 0)}%` }} /></div><b>{integer(crmCondominium.contracts)}</b></div>
              <div className="proj-total"><span>Receita somada no período</span><strong>{money(salesRevenue)}</strong></div>
            </div>
          ) : (
            <div className="empty-state" style={{ flexDirection: "column", gap: 6, textAlign: "center" }}>
              <strong style={{ color: "var(--text-2)", fontSize: 12 }}>Nenhum resultado informado</strong>
              <span>Contratos fechados e receita são digitados em CRM e vendas: não saem da foto do kanban nem dos leads de mídia.</span>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        <Panel className="fill-chart" title="Evolução diária por frente" description="Como cada frente respondeu ao longo do período" actions={<Segmented value={metric} onChange={setMetric} options={[{ id: "leads", label: "Leads" }, { id: "spend", label: "Investimento" }, { id: "cpl", label: "CPL" }]} />}>
          <div className="chart-box h-320">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors.red} stopOpacity=".45" /><stop offset="100%" stopColor={colors.red} stopOpacity="0" /></linearGradient>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors.gold} stopOpacity=".45" /><stop offset="100%" stopColor={colors.gold} stopOpacity="0" /></linearGradient>
                </defs>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10.5 }} dy={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={54} tick={{ fill: colors.tick, fontSize: 10 }} tickFormatter={(v) => (metric === "leads" ? compact(Number(v)) : money(Number(v)).replace(",00", ""))} />
                <Tooltip content={<ChartTip format={fmt} />} cursor={{ stroke: colors.tick, strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="Franquias" stroke={colors.red} strokeWidth={2.5} fill="url(#gF)" stackId={metric === "cpl" ? undefined : "a"} connectNulls isAnimationActive animationDuration={1400} />
                <Area type="monotone" dataKey="Condomínios" stroke={colors.gold} strokeWidth={2.5} fill="url(#gC)" stackId={metric === "cpl" ? undefined : "a"} connectNulls isAnimationActive animationDuration={1400} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: colors.red }} />Franquias</span><span><i style={{ background: colors.gold }} />Condomínios</span></div>
        </Panel>
        {/* Coluna lateral: os dois painéis se esticam para fechar com a altura do gráfico. */}
        <div className="panel-stack">
          <Panel title="Origem dos leads" description="Volume por canal no período">
            <BarList items={channelMix} format={integer} />
          </Panel>
          <Panel title="Eficiência por frente" description="CPL e taxa de conversão de clique em lead">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <MiniStat label="CPL franquias" value={franchise.current.cpl ?? 0} format={money} accent="var(--red)" delta={<Delta current={franchise.current.cpl} previous={franchise.previous.cpl} lowerIsBetter />} />
              <MiniStat label="CPL condomínios" value={condominium.current.cpl ?? 0} format={money} accent="var(--gold)" delta={<Delta current={condominium.current.cpl} previous={condominium.previous.cpl} lowerIsBetter />} />
              <MiniStat label="Conversão franquias" value={franchise.current.conv_rate ?? 0} format={percent} accent="var(--red)" />
              <MiniStat label="Conversão condomínios" value={condominium.current.conv_rate ?? 0} format={percent} accent="var(--gold)" />
            </div>
          </Panel>
        </div>
      </div>

    </div>
  );
}

function FrontCard({ front, totals, previous, spark, onClick }: { front: "franchise" | "condominium"; totals: DashboardData["franchise"]["current"]; previous: DashboardData["franchise"]["previous"]; spark: number[]; onClick: () => void }) {
  const meta = frontMeta[front];
  const tilt = useTilt<HTMLElement>(6);
  return (
    <article ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className={`front-card tilt ${front}`} onClick={onClick} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div className="front-card-head"><h3><i />{meta.label}</h3><ArrowRight size={18} /></div>
      <div className="front-main"><strong><AnimatedNumber value={totals.leads} format={integer} /></strong><small>{meta.leadWord} no período</small></div>
      <Sparkline className="front-spark" points={spark} color={front === "franchise" ? "#d8443a" : "#e9ad3f"} />
      <div className="front-meta">
        <div><small>Investimento</small><b>{money(totals.spend)}</b></div>
        <div><small>CPL</small><b>{money(totals.cpl)}</b></div>
        <div><small>vs. anterior</small><b><Delta current={totals.leads} previous={previous.leads} /></b></div>
      </div>
    </article>
  );
}

export function MiniStat({ label, value, format, accent, delta }: { label: string; value: number; format: (n: number) => string; accent?: string; delta?: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--bg) 40%, transparent)", border: "1px solid var(--line)", borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      <small style={{ display: "block", color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>{label}</small>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}><b style={{ fontSize: 18, fontWeight: 750, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}><AnimatedNumber value={value} format={format} /></b>{delta}</div>
    </div>
  );
}
