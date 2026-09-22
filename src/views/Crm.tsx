import { BadgeDollarSign, Clock3, FileSignature, Info, Percent, PiggyBank, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarList, ChartTip, CycleBar, Funnel, Kpi, Panel, Segmented } from "../components/ui/primitives";
import { demoCrm } from "../data/demo";
import { integer, money, percent, shortDate } from "../lib/format";
import { useGoals } from "../lib/goals";
import { frontMeta, useChartColors, type DashboardData } from "../lib/use-dashboard";
import type { Front } from "../types";

export function CrmView({ data }: { data: DashboardData }) {
  const colors = useChartColors();
  const [goals] = useGoals();
  const [front, setFront] = useState<Front>("franchise");
  const crm = useMemo(() => demoCrm(front, data[front].current.leads), [front, data]);
  const crmPrev = useMemo(() => demoCrm(front, data[front].previous.leads), [front, data]);
  const meta = frontMeta[front];
  const accent = front === "franchise" ? colors.red : colors.gold;
  const contractsGoal = front === "franchise" ? goals.contracts_franchise : goals.contracts_condominium;
  const funnelStages = useMemo(() => crm.stages.map((s, i) => ({ ...s, previous_count: crmPrev.stages[i]?.count })), [crm.stages, crmPrev.stages]);
  const totalPotential = crm.revenue + crm.projected_revenue;
  const biggestDrop = useMemo(() => {
    let worst = { name: "", pct: 0 };
    crm.stages.forEach((s, i) => {
      if (!i) return;
      const prev = crm.stages[i - 1].count;
      const lostPct = prev ? ((prev - s.count) * 100) / prev : 0;
      if (lostPct > worst.pct) worst = { name: s.name, pct: lostPct };
    });
    return worst;
  }, [crm.stages]);

  return (
    <div className="view-enter" key={front}>
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--sky)" }} />CRM Elo · integração via webhook</span>
          <h1>Do lead ao contrato, <em>com receita no fim</em></h1>
          <p>Etapas do funil comercial, taxas de passagem, tempo por etapa e receita gerada, comparados com o período anterior. A área já está pronta para receber os dados reais do Elo assim que a API deles for liberada.</p>
        </div>
        <Segmented value={front} onChange={setFront} options={[{ id: "franchise", label: "Franquias", className: "franchise" }, { id: "condominium", label: "Condomínios", className: "condominium" }]} />
      </div>
      <div className="crm-note"><Info size={18} /><span><b>Dados ilustrativos.</b> O CRM Elo ainda não expõe API de leitura; a integração está em desenvolvimento pelo fornecedor. Quando liberada, esta tela passa a refletir o funil real com UTMs de cada campanha.</span></div>

      <div className="grid grid-6">
        <Kpi label={front === "franchise" ? "Contratos assinados" : "Lojas contratadas"} value={crm.contracts} previous={crmPrev.contracts} format={integer} accent={meta.accent} icon={<FileSignature size={16} />} foot={`meta do mês: ${contractsGoal}`} />
        <Kpi label="Receita em taxa de franquia" value={front === "franchise" ? crm.revenue : null} previous={front === "franchise" ? crmPrev.revenue : null} format={money} accent="green" icon={<BadgeDollarSign size={16} />} foot={front === "franchise" ? `ticket médio ${money(crm.avg_ticket)}` : "modelo sem taxa direta"} />
        <Kpi label="Conversão lead → contrato" value={crm.conversion_rate} previous={crmPrev.conversion_rate} format={percent} accent="sky" icon={<Percent size={16} />} />
        <Kpi label="Ciclo médio de venda" value={crm.avg_cycle_days} previous={crmPrev.avg_cycle_days} format={(n) => `${Math.round(n)} dias`} accent="navy" icon={<Clock3 size={16} />} lowerIsBetter />
        <Kpi label="Pipeline em proposta" value={front === "franchise" ? crm.pipeline_value : null} format={money} accent="gold" icon={<PiggyBank size={16} />} hideDelta foot={`${crm.stages[4].count} propostas abertas`} />
        <Kpi label="Discovery Day" value={crm.stages[3].count} previous={crmPrev.stages[3].count} format={integer} accent="violet" icon={<Trophy size={16} />} foot="participantes no período" />
      </div>

      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        <Panel title={`Funil · ${meta.short}`} description="O funil afunila de acordo com a queda real de volume; os pontos escoando mostram o fluxo contínuo de leads" badge={<span className="badge sky">vs. período anterior</span>}>
          {biggestDrop.name && (
            <div className="crm-note" style={{ marginBottom: 16 }}>
              <Info size={18} />
              <span>Maior perda de volume está em <b>{biggestDrop.name}</b>, onde {biggestDrop.pct.toFixed(0)}% dos leads da etapa anterior não avançam.</span>
            </div>
          )}
          <Funnel stages={funnelStages} color={meta.color} format={integer} />
        </Panel>
        <Panel title="Tempo médio por etapa" description={`Ciclo total: ~${crm.avg_cycle_days} dias (anterior: ~${crmPrev.avg_cycle_days} dias)`}>
          <CycleBar stages={crm.stages} color={meta.color} totalDays={crm.avg_cycle_days} />
          <div className="grid grid-2" style={{ gap: 10, marginTop: 20 }}>
            <MiniCrmStat label="Ciclo atual" value={`${crm.avg_cycle_days} dias`} sub={crm.avg_cycle_days <= crmPrev.avg_cycle_days ? "mais rápido que o período anterior" : "mais lento que o período anterior"} good={crm.avg_cycle_days <= crmPrev.avg_cycle_days} />
            <MiniCrmStat label="Etapa mais demorada" value={[...crm.stages].sort((a, b) => b.avg_days - a.avg_days)[0]?.name ?? "—"} sub={`~${[...crm.stages].sort((a, b) => b.avg_days - a.avg_days)[0]?.avg_days ?? 0} dias`} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        <Panel title="Projetado vs. faturado" description="Receita já fechada contra a previsão ponderada do pipeline em aberto">
          <div className="proj-compare">
            <div className="proj-bar"><span>Faturado</span><div className="proj-track"><div className="proj-fill won" style={{ width: `${totalPotential ? (crm.revenue * 100) / totalPotential : 0}%` }} /></div><b>{money(crm.revenue)}</b></div>
            <div className="proj-bar"><span>Projetado (pipeline aberto)</span><div className="proj-track"><div className="proj-fill forecast" style={{ width: `${totalPotential ? (crm.projected_revenue * 100) / totalPotential : 0}%` }} /></div><b>{money(crm.projected_revenue)}</b></div>
            <div className="proj-total"><span>Potencial total do período</span><strong>{money(totalPotential)}</strong></div>
          </div>
        </Panel>
        <Panel title="Mês a mês" description="Leads, reuniões e contratos, com a receita em linha">
          <div className="chart-box h-320">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={crm.monthly.map((m) => ({ label: m.month, Leads: m.leads, Reuniões: m.meetings, Contratos: m.contracts, Receita: m.revenue }))} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10.5 }} dy={8} />
                <YAxis yAxisId="l" tickLine={false} axisLine={false} width={40} tick={{ fill: colors.tick, fontSize: 10 }} />
                {front === "franchise" && <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={56} tick={{ fill: colors.tick, fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />}
                <Tooltip content={<ChartTip format={(n, k) => (k === "Receita" ? money(n) : integer(n))} />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                <Bar yAxisId="l" dataKey="Leads" fill={colors.grid === "#e6ebef" ? "#c9d2d9" : "rgba(255,255,255,.14)"} radius={[6, 6, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="l" dataKey="Reuniões" fill={colors.sky} radius={[6, 6, 0, 0]} maxBarSize={22} />
                <Bar yAxisId="l" dataKey="Contratos" fill={accent} radius={[6, 6, 0, 0]} maxBarSize={22} />
                {front === "franchise" && <Line yAxisId="r" type="monotone" dataKey="Receita" stroke={colors.green} strokeWidth={2.5} dot={{ r: 3 }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: "rgba(128,128,128,.4)" }} />Leads</span><span><i style={{ background: colors.sky }} />Reuniões</span><span><i style={{ background: accent }} />Contratos</span>{front === "franchise" && <span><i style={{ background: colors.green }} />Receita</span>}</div>
        </Panel>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Panel title="Origem dos contratos" description="Qual canal trouxe quem realmente fechou">
          <BarList items={crm.sources.map((s, i) => ({ name: s.name, value: s.contracts, color: [colors.meta, colors.google, colors.instagram, colors.gold][i], hint: `${integer(s.leads)} leads` }))} format={integer} />
        </Panel>
        <Panel title="Negociações recentes" description="Últimas movimentações no CRM">
          <div className="recent-list">
            {crm.recent.map((r) => (
              <div className="recent" key={r.id}>
                <span className="av">{r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                <div><strong>{r.name}</strong><small>{r.city} · {r.source}</small></div>
                <div className="right"><b>{r.stage}</b><small style={{ color: "var(--muted)", fontSize: 10 }}>{shortDate(r.updated_at)}{r.value ? ` · ${money(r.value)}` : ""}</small></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MiniCrmStat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--bg) 40%, transparent)", border: "1px solid var(--line)" }}>
      <small style={{ display: "block", color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 800 }}>{label}</small>
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 750, letterSpacing: "-.01em" }}>{value}</div>
      {sub && <div style={{ marginTop: 3, fontSize: 10.5, color: good == null ? "var(--muted)" : good ? "var(--green)" : "var(--red)" }}>{sub}</div>}
    </div>
  );
}
