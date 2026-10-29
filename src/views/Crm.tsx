import { BadgeDollarSign, Clock3, FileSignature, Info, Layers, Pencil, PiggyBank, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ManualNumbersPanel } from "../components/ui/editable";
import { BarList, ChartTip, CycleBar, Funnel, Kpi, Panel, Segmented } from "../components/ui/primitives";
import { slowestCommercialStage } from "../lib/crm";
import { isPostSale } from "../lib/crm-stages";
import { isDemoMode } from "../lib/api";
import { integer, money } from "../lib/format";
import { useGoals } from "../lib/goals";
import {
  funnelFields, funnelToValues, resultFields, resultsToValues, valuesToFunnel, valuesToResults,
} from "../lib/manual-fields";
import { useSaveCommercialRecord, useDeleteCommercialRecord } from "../lib/commercial-data";
import { commercialFronts } from "../lib/fronts";
import { CommercialFrontSelector } from "../components/CommercialFrontSelector";
import { COMMERCIAL_DEMO_LABEL } from "../lib/commercial-demo";
import { exampleCrmSummary } from "../lib/commercial-examples";
import { buildCrmSummary } from "../lib/crm";
import { dateTime } from "../lib/format";
import { useChartColors, type DashboardData } from "../lib/use-dashboard";
import type { CommercialFront, DateRange } from "../types";

// Duas naturezas de dado convivem nesta tela sem se misturar:
//
//   Foto do kanban   — quantas oportunidades estão em cada coluna AGORA.
//   Resultado        — quantos contratos fecharam e quanto faturou no período.
//
// Nenhum indicador de resultado é calculado a partir da foto, e nenhuma taxa de
// passagem é lida entre colunas vizinhas: são estoques independentes.
export function CrmView({ data, readOnly, range, preview, onPreviewChange, selectedFront: controlledFront, onFrontChange }: { data: DashboardData; readOnly?: boolean; range: DateRange; preview?: boolean; onPreviewChange?: (next: boolean) => void; selectedFront?: CommercialFront; onFrontChange?: (next: CommercialFront) => void }) {
  const colors = useChartColors();
  const goals = useGoals();
  const saveCommercial = useSaveCommercialRecord();
  const deleteCommercial = useDeleteCommercialRecord();
  const [deleting, setDeleting] = useState<{ front: CommercialFront; kind: "snapshot" | "result"; range: DateRange } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [selectedFront, setSelectedFront] = useState<CommercialFront>("franchise");
  const [localPreview, setLocalPreview] = useState(false);
  const showingExamples = preview ?? localPreview;
  const setPreview = (next: boolean) => { setLocalPreview(next); onPreviewChange?.(next); };
  const front = controlledFront ?? selectedFront;
  useEffect(() => { setDeleting(null); setDeleteError(""); }, [front, range.start, range.end, showingExamples]);
  const changeFront = (next: CommercialFront) => { setSelectedFront(next); onFrontChange?.(next); };
  const operational = data.crm[front] ?? buildCrmSummary(front, null, null, { rows: [] });
  const rows = front === "franchise" || front === "condominium" ? data[front]?.rows ?? [] : [];
  const crm = showingExamples ? exampleCrmSummary(front, range, rows) : operational;
  const media = operational;
  const meta = commercialFronts[front];
  const contractsGoal = front === "franchise" ? goals.contracts_franchise : front === "condominium" ? goals.contracts_condominium : null;
  const access = data.commercial?.access;
  const editable = !readOnly && !showingExamples && !!access?.canEdit;
  const periodLabel = `${range.start.split("-").reverse().join("/")} a ${range.end.split("-").reverse().join("/")}`;
  const snapshot = data.commercial?.entries[front]?.snapshot ?? null;
  const result = data.commercial?.entries[front]?.result ?? null;
  const example = showingExamples || isDemoMode || crm.snapshot_origin === "example";
  const source = example ? "Dados de exemplo" : crm.snapshot_available || crm.results_available ? "Dados inseridos manualmente" : "Sem registros comerciais";
  // Implantação é pós-venda: fica fora do ciclo e da etapa mais demorada.
  const commercialStages = useMemo(() => crm.stages.filter((stage) => !isPostSale(stage)), [crm.stages]);
  const slowestStage = useMemo(() => slowestCommercialStage(crm.stages), [crm.stages]);
  // Coluna com mais oportunidades paradas hoje. É concentração de estoque, não
  // taxa de perda: a diferença entre duas colunas vizinhas não significa nada.
  const busiest = useMemo(
    () => crm.stages.filter((stage) => stage.kind === "commercial" && stage.count != null && stage.count > 0).sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0],
    [crm.stages],
  );

  return (
    <div className="view-enter" key={`${front}|${showingExamples}|${range.start}|${range.end}`}>
      <div className="view-head">
        <div>
          <span className="eyebrow"><i style={{ background: "var(--sky)" }} />Vendas · {source}</span>
          <h1>Pipeline de hoje e <em>resultado do período</em></h1>
          <p>Onde estão as oportunidades agora, quanto tempo elas passam em cada etapa e quanto a frente fechou no período. A área já está pronta para receber os dados reais do Elo assim que a API deles for liberada.</p>
        </div>
        <div className="crm-head-side">
          <CommercialFrontSelector front={front} onChange={changeFront} />
          <span className="crm-source-tag"><Pencil size={11} />{source}</span>
          <button type="button" className="secondary-button" aria-pressed={showingExamples} onClick={() => setPreview(!showingExamples)}>{showingExamples ? "Voltar aos dados reais" : "Visualizar funis ilustrativos"}</button>
        </div>
      </div>
      <div className="crm-note">
        <Info size={18} />
        {example ? <span>
          <b>{COMMERCIAL_DEMO_LABEL}.</b> Esta prévia não é salva na operação nem no Supabase e não representa resultados reais. Os dados de mídia permanecem em sua origem própria.
        </span> : <span>{source}. Snapshot atual e resultados de {periodLabel} são registros separados. A integração com CRM Elo continua pendente.</span>}
      </div>

      <div className="grid grid-6">
        <Kpi label="Contratos no período" value={crm.contracts} format={integer} accent={meta.accent} icon={<FileSignature size={16} />} hideDelta foot={crm.results_available ? contractsGoal == null ? `informado · ${periodLabel}` : `informado · meta do mês: ${integer(contractsGoal)}` : "Aguardando integração com CRM Elo."} />
        <Kpi label="Receita no período" value={crm.revenue} format={money} accent="green" icon={<BadgeDollarSign size={16} />} hideDelta foot={crm.results_available ? crm.avg_ticket_realized ? `ticket realizado ${money(crm.avg_ticket)}` : `informada · ${periodLabel}` : "Aguardando integração com CRM Elo."} />
        <Kpi label="Oportunidades abertas" value={crm.open_opportunities} format={integer} accent="sky" icon={<Layers size={16} />} hideDelta foot="cards nas etapas comerciais hoje" />
        <Kpi label="Ciclo médio de venda" value={crm.avg_cycle_days} format={(n) => `${Math.round(n)} dias`} accent="navy" icon={<Clock3 size={16} />} hideDelta foot="tempo informado nas etapas até o contrato" />
        {/* Pipeline em contagem de oportunidades: multiplicar estoque por ticket e
            chamar de receita esperada suporia uma probabilidade que não existe. */}
        <Kpi label={crm.pipeline_stage ? `Em ${crm.pipeline_stage.name.toLowerCase()}` : "Antes do contrato"} value={crm.pipeline_stage?.count ?? null} format={integer} accent="gold" icon={<PiggyBank size={16} />} hideDelta foot="oportunidades na última etapa antes do contrato" />
        <Kpi label={crm.visit_stage?.name ?? "Visitas"} value={crm.visit_stage?.count ?? null} format={integer} accent="violet" icon={<Trophy size={16} />} hideDelta foot="oportunidades nesta etapa hoje" />
      </div>

      {!example && !access?.policyReady && <p className="commercial-access-note" role="status">Edição operacional bloqueada até a aprovação e configuração das permissões no Supabase.</p>}
      {!example && access?.policyReady && !access.canEdit && <p className="commercial-access-note" role="status">Seu perfil permite somente leitura dos dados comerciais.</p>}
      {data.commercial?.isError && <p className="manual-error" role="alert">Não foi possível carregar os registros comerciais. Nenhum exemplo foi usado como substituto.</p>}
      {editable && access?.canManage && !isDemoMode && <div className="commercial-delete-actions">
        {snapshot && <button type="button" className="secondary-button" onClick={() => { setDeleteError(""); setDeleting({ front, kind: "snapshot", range: { ...range } }); }}>Excluir pipeline atual</button>}
        {result && <button type="button" className="secondary-button" onClick={() => { setDeleteError(""); setDeleting({ front, kind: "result", range: { ...range } }); }}>Excluir resultado do período</button>}
        {deleting && <div role="alertdialog" aria-label="Confirmar exclusão comercial" className="commercial-access-note">
          <p>Excluir {deleting.kind === "snapshot" ? "o pipeline atual" : `o resultado de ${deleting.range.start} a ${deleting.range.end}`} de {commercialFronts[deleting.front].short}? Esta ação remove somente esse registro comercial.</p>
          <button type="button" className="secondary-button" disabled={deleteCommercial.isPending} onClick={() => setDeleting(null)}>Cancelar exclusão</button>
          <button type="button" className="secondary-button" disabled={deleteCommercial.isPending} onClick={async () => {
            try { await deleteCommercial.mutateAsync(deleting); setDeleting(null); }
            catch (error) { setDeleteError(error instanceof Error ? error.message : "Não foi possível excluir o registro."); }
          }}>{deleteCommercial.isPending ? "Excluindo…" : "Confirmar exclusão"}</button>
          {deleteError && <p role="alert" className="manual-error">{deleteError}</p>}
        </div>}
      </div>}
      {editable && (
        <div className="grid grid-wide sales-editors" style={{ marginTop: 14 }} key={`${front}|${range.start}|${range.end}`}>
          <ManualNumbersPanel title={`Pipeline atual · ${meta.short}`} description="Snapshot atual do Kanban; não representa conversões acumuladas" badge={<span className="badge sky">{isDemoMode ? "Simulação local" : "Entrada manual"}</span>} fields={funnelFields(front)} values={funnelToValues(front, snapshot)} onSave={values => saveCommercial.mutateAsync({ front, kind: "snapshot", range, values: valuesToFunnel(front, values) })} saveLabel="Salvar pipeline" footNote={crm.snapshot_updated_at ? `Atualizado em ${dateTime(crm.snapshot_updated_at)}` : "Registro inicialmente vazio. Preencha apenas valores conhecidos."} />
          <ManualNumbersPanel title={`Resultado do período · ${meta.short}`} description={`Período de referência obrigatório: ${periodLabel}`} badge={<span className="badge green">{isDemoMode ? "Simulação local" : "Entrada manual"}</span>} fields={resultFields(front)} values={resultsToValues(result)} onSave={values => saveCommercial.mutateAsync({ front, kind: "result", range, values: valuesToResults(values) })} saveLabel="Salvar resultado" footNote={crm.results_updated_at ? `Atualizado em ${dateTime(crm.results_updated_at)} · ${periodLabel}` : "Este resultado só será exibido para este mesmo intervalo de datas."} />
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
          {!example && crm.snapshot_updated_at && <p className="manual-foot">Entrada manual · atualizado em {dateTime(crm.snapshot_updated_at)}</p>}
          {!crm.snapshot_available && <p className="manual-foot" role="status">Aguardando integração com CRM Elo.</p>}
          <Funnel stages={crm.stages} color={meta.color} format={integer} />
        </Panel>
        {/* Coluna lateral: ciclo e resultado mantêm a altura do conteúdo. */}
        <div className="panel-stack">
          <Panel title="Tempo médio por etapa" description={crm.avg_cycle_days != null ? `Ciclo até o contrato: ~${crm.avg_cycle_days} dias` : crm.snapshot_available ? "Preencha o tempo de cada etapa para ver o ciclo" : "Aguardando integração com CRM Elo."}>
            {(crm.avg_cycle_days != null && crm.avg_cycle_days > 0) ? (
              <>
                <CycleBar stages={commercialStages} color={meta.color} totalDays={crm.avg_cycle_days!} />
                <div className="grid grid-2" style={{ gap: 10, marginTop: 16 }}>
                  <MiniCrmStat label="Ciclo total" value={`${crm.avg_cycle_days} dias`} sub="soma do tempo das etapas até o contrato" />
                  <MiniCrmStat label="Etapa mais demorada" value={slowestStage?.name ?? "—"} sub={slowestStage ? `~${slowestStage.avg_days} dias` : undefined} />
                </div>
              </>
            ) : (
              <div className="empty-state">{crm.avg_cycle_days === 0 ? "Tempos comerciais informados: 0 dias." : crm.snapshot_available ? "Complete os tempos comerciais conhecidos para exibir o ciclo." : "Aguardando integração com CRM Elo."}</div>
            )}
          </Panel>
          <Panel title="Resultado do período" description={`Fechamento e faturamento · ${periodLabel}`}>
            {crm.results_available ? (
              <div className="proj-compare">
                <div className="proj-bar"><span>Contratos fechados</span><div className="proj-track"><div className="proj-fill won" style={{ width: `${Math.min(100, contractsGoal != null && contractsGoal > 0 ? ((crm.contracts ?? 0) * 100) / contractsGoal : 100)}%` }} /></div><b>{integer(crm.contracts)}</b></div>
                <div className="proj-bar"><span>Receita</span><div className="proj-track"><div className="proj-fill won" style={{ width: (crm.revenue != null && crm.revenue > 0) ? "100%" : "0%" }} /></div><b>{money(crm.revenue)}</b></div>
                <div className="proj-total"><span>{crm.avg_ticket_realized ? "Ticket realizado" : "Ticket de referência"}</span><strong>{money(crm.avg_ticket)}</strong></div>
              </div>
            ) : (
              <div className="empty-state" style={{ flexDirection: "column", gap: 6, textAlign: "center" }}>
                <strong style={{ color: "var(--text-2)", fontSize: 12 }}>{crm.results_available ? "Nenhum resultado informado para o período" : "Aguardando integração com CRM Elo."}</strong>
                <span>{crm.results_available ? "Contratos fechados e receita não saem da foto do kanban." : "Os indicadores serão exibidos quando houver registros comerciais reais."}</span>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-wide" style={{ marginTop: 14 }}>
        <Panel className="fill-chart" title="Leads de mídia mês a mês" description="Volume real gerado por Meta Ads e Google Ads. Contratos e receita mensais não aparecem aqui: só existem para o período informado, sem série histórica no CRM.">
          {media.monthly.length ? (
            <div className="chart-box h-320">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={media.monthly.map((m) => ({ label: m.month, Leads: m.leads }))} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
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
            {media.sources.length ? (
              <>
                <BarList items={media.sources.map((source, index) => ({ name: source.name, value: source.leads, color: [colors.meta, colors.google, colors.instagram, colors.gold][index] }))} format={integer} />
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
