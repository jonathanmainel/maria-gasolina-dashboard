import { BadgeDollarSign, Clock3, FileSignature, Info, Percent, PiggyBank, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ManualNumbersPanel } from "../components/ui/editable";
import { BarList, ChartTip, CycleBar, Funnel, Kpi, Panel, Segmented } from "../components/ui/primitives";
import { slowestCommercialStage } from "../lib/crm";
import { isPostSale } from "../lib/crm-stages";
import { integer, money, percent } from "../lib/format";
import { useGoals } from "../lib/goals";
import { funnelFields, funnelToValues, valuesToFunnel } from "../lib/manual-fields";
import { useManualData, useSaveManualData } from "../lib/manual-inputs";
import { frontMeta, useChartColors, type DashboardData } from "../lib/use-dashboard";
import { ManualStorageNote } from "./Settings";
import type { Front } from "../types";

export function CrmView({ data, readOnly }: { data: DashboardData; readOnly?: boolean }) {
  const colors = useChartColors();
  const goals = useGoals();
  const manual = useManualData();
  const saveManual = useSaveManualData();
  const [front, setFront] = useState<Front>("franchise");
  const crm = data.crm[front];
  const meta = frontMeta[front];
  const accent = front === "franchise" ? colors.red : colors.gold;
  const contractsGoal = front === "franchise" ? goals.contracts_franchise : goals.contracts_condominium;
  const totalPotential = crm.revenue + crm.projected_revenue;
  // Não existe "reunião" nos dois funis: cada frente tem a própria etapa de
  // visita ("Visita / Call" e "Visita / Proposta"), localizada pelo papel.
  const visitLabel = crm.visit_stage?.name ?? "Visitas";
  const highlightStage = crm.visit_stage ?? crm.stages.find(isPostSale) ?? null;
  // Implantação é pós-venda: não disputa "etapa mais demorada" nem "maior perda".
  const commercialStages = useMemo(() => crm.stages.filter((stage) => !isPostSale(stage)), [crm.stages]);
  const slowestStage = useMemo(() => slowestCommercialStage(crm.stages), [crm.stages]);
  const biggestDrop = useMemo(() => {
    let worst = { name: "", pct: 0 };
    commercialStages.forEach((stage, index) => {
      if (!index) return;
      const previous = commercialStages[index - 1].count;
      const lostPct = previous ? ((previous - stage.count) * 100) / previous : 0;
      if (lostPct > worst.pct) worst = { name: stage.name, pct: lostPct };
    });
    return worst;
  }, [commercialStages]);

  return (
    <div className="view-enter" key={front}>
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--sky)" }} />CRM Elo · entrada manual</span>
          <h1>Do lead ao contrato, <em>com receita no fim</em></h1>
          <p>Etapas do funil comercial, taxas de passagem, tempo por etapa e receita gerada. A área já está pronta para receber os dados reais do Elo assim que a API deles for liberada.</p>
        </div>
        <Segmented value={front} onChange={setFront} options={[{ id: "franchise", label: "Franquias", className: "franchise" }, { id: "condominium", label: "Condomínios", className: "condominium" }]} />
      </div>
      <div className="crm-note">
        <Info size={18} />
        <span>
          <b>Dados preenchidos à mão.</b> O CRM Elo ainda não expõe API de leitura; a integração está em desenvolvimento pelo fornecedor.
          Até lá, os volumes por etapa, o tempo de cada etapa e o ticket médio são digitados aqui — receita, conversão, ciclo, pipeline e
          projeção são calculados automaticamente a partir deles. O volume mensal de leads e a origem dos contratos já usam o dado real de mídia.
        </span>
      </div>

      <div className="grid grid-6">
        <Kpi label="Contratos" value={crm.contracts} format={integer} accent={meta.accent} icon={<FileSignature size={16} />} hideDelta foot={`meta do mês: ${integer(contractsGoal)}`} />
        <Kpi label="Receita em taxa de franquia" value={crm.avg_ticket > 0 ? crm.revenue : null} format={money} accent="green" icon={<BadgeDollarSign size={16} />} hideDelta foot={crm.avg_ticket > 0 ? `ticket médio ${money(crm.avg_ticket)}` : "modelo sem taxa direta"} />
        <Kpi label="Conversão lead → contrato" value={crm.conversion_rate} format={percent} accent="sky" icon={<Percent size={16} />} hideDelta foot="Contrato sobre o topo do funil" />
        <Kpi label="Ciclo médio de venda" value={crm.avg_cycle_days > 0 ? crm.avg_cycle_days : null} format={(n) => `${Math.round(n)} dias`} accent="navy" icon={<Clock3 size={16} />} hideDelta foot="etapas até o contrato" />
        <Kpi label={crm.pipeline_stage ? `Pipeline em ${crm.pipeline_stage.name.toLowerCase()}` : "Pipeline aberto"} value={crm.avg_ticket > 0 ? crm.pipeline_value : null} format={money} accent="gold" icon={<PiggyBank size={16} />} hideDelta foot={crm.pipeline_stage ? `${integer(crm.pipeline_stage.count)} em "${crm.pipeline_stage.name}"` : "sem etapa anterior ao contrato"} />
        {/* Etapa de visita da frente, ou a pós-venda quando a frente não tiver visita — sempre por semântica, nunca por posição. */}
        <Kpi label={highlightStage?.name ?? "—"} value={highlightStage?.count ?? 0} format={integer} accent="violet" icon={<Trophy size={16} />} hideDelta foot={highlightStage && isPostSale(highlightStage) ? "pós-venda · não conta como contrato" : "volume no período"} />
      </div>

      {!readOnly && (
        <div style={{ marginTop: 14 }}>
          <ManualStorageNote storage={manual.storage} reason={manual.fallbackReason} />
          <ManualNumbersPanel
            title={`Valores do funil · ${meta.short}`}
            description="Só os valores-base: receita, conversão, ciclo, pipeline e projeção são calculados a partir daqui"
            badge={<span className="badge sky">Entrada manual</span>}
            fields={funnelFields(front)}
            values={funnelToValues(front, manual.data.funnel[front])}
            onSave={(next) => saveManual.mutateAsync({
              ...manual.data,
              funnel: { ...manual.data.funnel, [front]: valuesToFunnel(front, next) },
            })}
            saveLabel="Salvar funil"
            footNote="Quando a API do Elo entrar, estes campos são substituídos pelo funil real sem mexer na tela."
          />
        </div>
      )}

      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        <Panel title={`Funil · ${meta.short}`} description="Todas as etapas do CRM na ordem real. Implantação aparece depois do contrato como pós-venda e não conta como fechamento.">
          {biggestDrop.name && (
            <div className="crm-note" style={{ marginBottom: 16 }}>
              <Info size={18} />
              <span>Maior perda de volume está em <b>{biggestDrop.name}</b>, onde {biggestDrop.pct.toFixed(0)}% dos leads da etapa anterior não avançam.</span>
            </div>
          )}
          <Funnel stages={crm.stages} color={meta.color} format={integer} />
        </Panel>
        {/* Coluna lateral: ciclo e receita dividem a altura do funil. Antes cada um
            ocupava uma linha inteira ao lado de um vizinho bem mais alto e sobrava
            quase metade do painel vazio. */}
        <div className="panel-stack">
          <Panel title="Tempo médio por etapa" description={crm.avg_cycle_days > 0 ? `Ciclo total: ~${crm.avg_cycle_days} dias` : "Preencha o tempo de cada etapa para ver o ciclo"}>
            {crm.avg_cycle_days > 0 ? (
              <>
                <CycleBar stages={commercialStages} color={meta.color} totalDays={crm.avg_cycle_days} />
                <div className="grid grid-2" style={{ gap: 10, marginTop: 16 }}>
                  <MiniCrmStat label="Ciclo total" value={`${crm.avg_cycle_days} dias`} sub="soma do tempo das etapas até o contrato" />
                  <MiniCrmStat label="Etapa mais demorada" value={slowestStage?.name ?? "—"} sub={slowestStage ? `~${slowestStage.avg_days} dias` : undefined} />
                </div>
              </>
            ) : (
              <div className="empty-state">Nenhum tempo de etapa informado ainda.</div>
            )}
          </Panel>
          <Panel title="Projetado vs. faturado" description="Receita já fechada contra a previsão ponderada do pipeline em aberto">
            {totalPotential > 0 ? (
              <div className="proj-compare">
                <div className="proj-bar"><span>Faturado</span><div className="proj-track"><div className="proj-fill won" style={{ width: `${(crm.revenue * 100) / totalPotential}%` }} /></div><b>{money(crm.revenue)}</b></div>
                <div className="proj-bar"><span>Projetado (pipeline aberto)</span><div className="proj-track"><div className="proj-fill forecast" style={{ width: `${(crm.projected_revenue * 100) / totalPotential}%` }} /></div><b>{money(crm.projected_revenue)}</b></div>
                <div className="proj-total"><span>Potencial total do período</span><strong>{money(totalPotential)}</strong></div>
              </div>
            ) : (
              <div className="empty-state">Esta frente não tem taxa direta: informe um ticket médio para projetar receita.</div>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        {/* O gráfico passou para a coluna larga: seis meses em três séries não cabiam
            bem em um terço da largura, e a comparação de receita, que é só três barras,
            não precisava de dois terços. */}
        <Panel className="fill-chart" title="Mês a mês" description="Leads reais de mídia, com visitas, contratos e receita projetados pela taxa informada">
          {crm.monthly.length ? (
            <>
              <div className="chart-box h-320">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={crm.monthly.map((m) => ({ label: m.month, Leads: m.leads, [visitLabel]: m.visits, Contratos: m.contracts, Receita: m.revenue }))} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={colors.grid} vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10.5 }} dy={8} />
                    <YAxis yAxisId="l" tickLine={false} axisLine={false} width={40} tick={{ fill: colors.tick, fontSize: 10 }} />
                    {crm.avg_ticket > 0 && <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={56} tick={{ fill: colors.tick, fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />}
                    <Tooltip content={<ChartTip format={(n, k) => (k === "Receita" ? money(n) : integer(n))} />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                    <Bar yAxisId="l" dataKey="Leads" fill={colors.grid === "#e6ebef" ? "#c9d2d9" : "rgba(255,255,255,.14)"} radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Bar yAxisId="l" dataKey={visitLabel} fill={colors.sky} radius={[6, 6, 0, 0]} maxBarSize={22} />
                    <Bar yAxisId="l" dataKey="Contratos" fill={accent} radius={[6, 6, 0, 0]} maxBarSize={22} />
                    {crm.avg_ticket > 0 && <Line yAxisId="r" type="monotone" dataKey="Receita" stroke={colors.green} strokeWidth={2.5} dot={{ r: 3 }} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: "rgba(128,128,128,.4)" }} />Leads</span><span><i style={{ background: colors.sky }} />{visitLabel}</span><span><i style={{ background: accent }} />Contratos</span>{crm.avg_ticket > 0 && <span><i style={{ background: colors.green }} />Receita</span>}</div>
            </>
          ) : (
            <div className="empty-state">Nenhum lead de mídia no período selecionado.</div>
          )}
        </Panel>
        <div className="panel-stack">
          <Panel title="Origem dos contratos" description="Qual canal trouxe quem realmente fechou">
            {crm.sources.length ? (
              <BarList items={crm.sources.map((source, index) => ({ name: source.name, value: source.contracts, color: [colors.meta, colors.google, colors.instagram, colors.gold][index], hint: `${integer(source.leads)} leads` }))} format={integer} />
            ) : (
              <div className="empty-state">Nenhum lead de mídia no período para distribuir os contratos.</div>
            )}
          </Panel>
          <Panel title="Negociações recentes" description="Últimas movimentações no CRM">
            <div className="empty-state" style={{ flexDirection: "column", gap: 6, textAlign: "center" }}>
              <strong style={{ color: "var(--text-2)", fontSize: 12 }}>Disponível quando a API do Elo for liberada</strong>
              <span>Negociação a negociação só existe dentro do CRM: não há como preencher esta lista à mão sem inventar dados.</span>
            </div>
          </Panel>
        </div>
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
