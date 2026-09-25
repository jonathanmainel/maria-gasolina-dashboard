import { BadgeDollarSign, Clock3, FileSignature, Info, Layers, PiggyBank, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ManualNumbersPanel } from "../components/ui/editable";
import { BarList, ChartTip, CycleBar, Funnel, Kpi, Panel, Segmented } from "../components/ui/primitives";
import { slowestCommercialStage } from "../lib/crm";
import { isPostSale } from "../lib/crm-stages";
import { integer, money } from "../lib/format";
import { useGoals } from "../lib/goals";
import {
  funnelFields, funnelToValues, resultFields, resultsToValues, valuesToFunnel, valuesToResults,
} from "../lib/manual-fields";
import { useManualData, useSaveManualData } from "../lib/manual-inputs";
import { frontMeta, useChartColors, type DashboardData } from "../lib/use-dashboard";
import { ManualStorageNote } from "./Settings";
import type { Front } from "../types";

// Duas naturezas de dado convivem nesta tela sem se misturar:
//
//   Foto do kanban   — quantas oportunidades estão em cada coluna AGORA.
//   Resultado        — quantos contratos fecharam e quanto faturou no período.
//
// Nenhum indicador de resultado é calculado a partir da foto, e nenhuma taxa de
// passagem é lida entre colunas vizinhas: são estoques independentes.
export function CrmView({ data, readOnly }: { data: DashboardData; readOnly?: boolean }) {
  const colors = useChartColors();
  const goals = useGoals();
  const manual = useManualData();
  const saveManual = useSaveManualData();
  const [front, setFront] = useState<Front>("franchise");
  const crm = data.crm[front];
  const meta = frontMeta[front];
  const contractsGoal = front === "franchise" ? goals.contracts_franchise : goals.contracts_condominium;
  // Implantação é pós-venda: fica fora do ciclo e da etapa mais demorada.
  const commercialStages = useMemo(() => crm.stages.filter((stage) => !isPostSale(stage)), [crm.stages]);
  const slowestStage = useMemo(() => slowestCommercialStage(crm.stages), [crm.stages]);
  // Coluna com mais oportunidades paradas hoje. É concentração de estoque, não
  // taxa de perda: a diferença entre duas colunas vizinhas não significa nada.
  const busiest = useMemo(
    () => crm.stages.filter((stage) => stage.kind === "commercial" && stage.count > 0).sort((a, b) => b.count - a.count)[0],
    [crm.stages],
  );

  return (
    <div className="view-enter" key={front}>
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--sky)" }} />CRM Elo · entrada manual</span>
          <h1>Pipeline de hoje e <em>resultado do período</em></h1>
          <p>Onde estão as oportunidades agora, quanto tempo elas passam em cada etapa e quanto a frente fechou no período. A área já está pronta para receber os dados reais do Elo assim que a API deles for liberada.</p>
        </div>
        <Segmented value={front} onChange={setFront} options={[{ id: "franchise", label: "Franquias", className: "franchise" }, { id: "condominium", label: "Condomínios", className: "condominium" }]} />
      </div>
      <div className="crm-note">
        <Info size={18} />
        <span>
          <b>Dois blocos diferentes, preenchidos à mão.</b> As etapas são uma <b>foto do kanban</b>: quantas oportunidades estão em cada
          coluna agora — e não um funil acumulado, por isso uma etapa pode ter mais cards do que a anterior. Já <b>contratos fechados</b> e
          <b> receita</b> são o <b>resultado do período</b> e têm campo próprio: um negócio fechado normalmente já saiu da coluna
          &ldquo;Contrato&rdquo; para &ldquo;Implantação&rdquo;, então a ocupação dela não mede faturamento. Sem API do Elo, o dashboard não
          deduz um a partir do outro.
        </span>
      </div>

      <div className="grid grid-6">
        <Kpi label="Contratos no período" value={crm.contracts} format={integer} accent={meta.accent} icon={<FileSignature size={16} />} hideDelta foot={`informado · meta do mês: ${integer(contractsGoal)}`} />
        <Kpi label="Receita no período" value={crm.revenue > 0 ? crm.revenue : null} format={money} accent="green" icon={<BadgeDollarSign size={16} />} hideDelta foot={crm.revenue > 0 ? (crm.avg_ticket_realized ? `ticket realizado ${money(crm.avg_ticket)}` : "informada") : "informe o resultado do período"} />
        <Kpi label="Oportunidades abertas" value={crm.open_opportunities} format={integer} accent="sky" icon={<Layers size={16} />} hideDelta foot="cards nas etapas comerciais hoje" />
        <Kpi label="Ciclo médio de venda" value={crm.avg_cycle_days > 0 ? crm.avg_cycle_days : null} format={(n) => `${Math.round(n)} dias`} accent="navy" icon={<Clock3 size={16} />} hideDelta foot="tempo informado nas etapas até o contrato" />
        {/* Pipeline em contagem de oportunidades: multiplicar estoque por ticket e
            chamar de receita esperada suporia uma probabilidade que não existe. */}
        <Kpi label={crm.pipeline_stage ? `Em ${crm.pipeline_stage.name.toLowerCase()}` : "Antes do contrato"} value={crm.pipeline_stage?.count ?? 0} format={integer} accent="gold" icon={<PiggyBank size={16} />} hideDelta foot="oportunidades na última etapa antes do contrato" />
        <Kpi label={crm.visit_stage?.name ?? "Visitas"} value={crm.visit_stage?.count ?? 0} format={integer} accent="violet" icon={<Trophy size={16} />} hideDelta foot="oportunidades nesta etapa hoje" />
      </div>

      {!readOnly && (
        <div className="grid grid-wide" style={{ marginTop: 14 }}>
          <div>
            <ManualStorageNote storage={manual.storage} reason={manual.fallbackReason} />
            <ManualNumbersPanel
              title={`Pipeline atual · ${meta.short}`}
              description="Quantas oportunidades estão em cada coluna do kanban agora, e quanto tempo em média ficam nela"
              badge={<span className="badge sky">Foto do kanban</span>}
              fields={funnelFields(front)}
              values={funnelToValues(front, manual.data.funnel[front])}
              onSave={(next) => saveManual.mutateAsync({
                ...manual.data,
                funnel: { ...manual.data.funnel, [front]: valuesToFunnel(front, next) },
              })}
              saveLabel="Salvar pipeline"
              footNote="Estoque instantâneo: o dashboard não lê taxa de passagem nem fechamento a partir destes números."
            />
          </div>
          <ManualNumbersPanel
            title={`Resultado do período · ${meta.short}`}
            description="O que a frente efetivamente fechou e faturou no período de referência"
            badge={<span className="badge green">Resultado</span>}
            fields={resultFields(front)}
            values={resultsToValues(manual.data.results[front])}
            onSave={(next) => saveManual.mutateAsync({
              ...manual.data,
              results: { ...manual.data.results, [front]: valuesToResults(next) },
            })}
            saveLabel="Salvar resultado"
            footNote="Digitado porque não é derivável do kanban: o card de um negócio fechado já saiu da coluna Contrato."
          />
        </div>
      )}

      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        <Panel title={`Pipeline por etapa · ${meta.short}`} description="Todas as etapas do CRM na ordem real, com as oportunidades paradas em cada uma hoje. Implantação vem depois do contrato, como pós-venda.">
          {busiest && (
            <div className="crm-note" style={{ marginBottom: 16 }}>
              <Info size={18} />
              <span>A maior concentração de oportunidades abertas está em <b>{busiest.name}</b>, com {integer(busiest.count)} card(s). Como as colunas são estoques independentes, isso indica acúmulo — não uma taxa de perda para a etapa seguinte.</span>
            </div>
          )}
          <Funnel stages={crm.stages} color={meta.color} format={integer} />
        </Panel>
        {/* Coluna lateral: ciclo e resultado dividem a altura do pipeline. */}
        <div className="panel-stack">
          <Panel title="Tempo médio por etapa" description={crm.avg_cycle_days > 0 ? `Ciclo até o contrato: ~${crm.avg_cycle_days} dias` : "Preencha o tempo de cada etapa para ver o ciclo"}>
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
          <Panel title="Resultado do período" description="Fechamento e faturamento informados para o período de referência">
            {crm.contracts > 0 || crm.revenue > 0 ? (
              <div className="proj-compare">
                <div className="proj-bar"><span>Contratos fechados</span><div className="proj-track"><div className="proj-fill won" style={{ width: `${Math.min(100, contractsGoal > 0 ? (crm.contracts * 100) / contractsGoal : 100)}%` }} /></div><b>{integer(crm.contracts)}</b></div>
                <div className="proj-bar"><span>Receita</span><div className="proj-track"><div className="proj-fill won" style={{ width: crm.revenue > 0 ? "100%" : "0%" }} /></div><b>{money(crm.revenue)}</b></div>
                <div className="proj-total"><span>{crm.avg_ticket_realized ? "Ticket realizado" : "Ticket de referência"}</span><strong>{money(crm.avg_ticket)}</strong></div>
              </div>
            ) : (
              <div className="empty-state" style={{ flexDirection: "column", gap: 6, textAlign: "center" }}>
                <strong style={{ color: "var(--text-2)", fontSize: 12 }}>Nenhum resultado informado para o período</strong>
                <span>Contratos fechados e receita não saem da foto do kanban: preencha o bloco de resultado do período.</span>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        <Panel className="fill-chart" title="Leads de mídia mês a mês" description="Volume real gerado por Meta Ads e Google Ads. Contratos e receita mensais não aparecem aqui: só existem para o período informado, sem série histórica no CRM.">
          {crm.monthly.length ? (
            <div className="chart-box h-320">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={crm.monthly.map((m) => ({ label: m.month, Leads: m.leads }))} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: colors.tick, fontSize: 10.5 }} dy={8} />
                  <YAxis tickLine={false} axisLine={false} width={40} tick={{ fill: colors.tick, fontSize: 10 }} />
                  <Tooltip content={<ChartTip format={integer} />} cursor={{ fill: "rgba(255,255,255,.04)" }} />
                  <Bar dataKey="Leads" fill={meta.color} radius={[6, 6, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">Nenhum lead de mídia no período selecionado.</div>
          )}
        </Panel>
        <div className="panel-stack">
          <Panel title="Origem dos leads de mídia" description="Qual canal gerou os leads do período">
            {crm.sources.length ? (
              <>
                <BarList items={crm.sources.map((source, index) => ({ name: source.name, value: source.leads, color: [colors.meta, colors.google, colors.instagram, colors.gold][index] }))} format={integer} />
                <p className="manual-foot">A origem dos <b>contratos</b> não aparece aqui: sem atribuição no CRM, não há como saber de qual canal veio quem fechou, e dividir os contratos na proporção dos leads seria inventar.</p>
              </>
            ) : (
              <div className="empty-state">Nenhum lead de mídia no período.</div>
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
