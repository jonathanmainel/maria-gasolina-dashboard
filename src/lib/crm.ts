import { closeStage, crmStages, cycleStages, isPostSale, preCloseStage, topStage, visitStage } from "./crm-stages";
import type { CrmSource, CrmStage, CrmSummary, Front, FrontDaily, ManualFunnelInput } from "../types";

// ---------------------------------------------------------------------------
// Funil comercial
//
// O CRM Elo ainda não tem API de leitura, então os volumes por etapa, o tempo em
// cada etapa e o ticket médio vêm da entrada manual (`lib/manual-inputs.ts`).
// Tudo o que dá para calcular é calculado aqui e não é pedido ao usuário:
// receita, conversão lead → contrato, ciclo médio, pipeline, projeção ponderada,
// taxas de passagem, evolução mensal e origem dos contratos.
//
// Nenhum indicador aqui depende da posição de uma etapa no array: quem é o
// fechamento comercial, quem é pós-venda e quem entra no ciclo vem da definição
// central em `lib/crm-stages.ts`. "Contrato" fecha a venda; "Implantação" vem
// depois dele, aparece no funil e não entra em contrato, receita nem conversão.
//
// A origem dos contratos e a série mensal usam o volume REAL de leads de mídia
// (Meta Ads e Google Ads) — só a taxa de fechamento vem do bloco manual.
// ---------------------------------------------------------------------------

export { crmStageNames } from "./crm-stages";

/** Etapas que aceitam tempo médio no editor manual, já sem a pós-venda contaminar o ciclo. */
export const crmCycleStageNames = (front: Front) => cycleStages(crmStages(front)).map((stage) => stage.name);

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/** Leads reais por mês, a partir da série diária de mídia já filtrada pela frente. */
function monthlyLeads(rows: FrontDaily[]): Array<{ key: string; label: string; leads: number }> {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = row.date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + row.leads);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, leads]) => ({ key, label: MONTH_LABELS[Number(key.slice(5, 7)) - 1] ?? key, leads }));
}

/** Leads reais por canal de mídia, usados para distribuir os contratos por origem. */
function channelLeads(rows: FrontDaily[]): Array<{ name: string; leads: number }> {
  const meta = rows.filter((row) => row.channel === "meta_ads").reduce((sum, row) => sum + row.leads, 0);
  const google = rows.filter((row) => row.channel === "google_ads").reduce((sum, row) => sum + row.leads, 0);
  return [
    { name: "Meta Ads", leads: meta },
    { name: "Google Ads", leads: google },
  ].filter((item) => item.leads > 0);
}

export interface CrmContext {
  /** Série diária de mídia da frente no período, para derivar mês a mês e origens. */
  rows: FrontDaily[];
}

export function buildCrmSummary(front: Front, input: ManualFunnelInput, context: CrmContext): CrmSummary {
  const definitions = crmStages(front);
  const avgTicket = Math.max(0, input.avg_ticket);
  const stages: CrmStage[] = definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    kind: definition.kind,
    role: definition.role,
    count: Math.max(0, Math.round(input.stages?.[definition.id] ?? 0)),
    avg_days: definition.tracksDays ? Math.max(0, input.stage_days?.[definition.id] ?? 0) : 0,
  }));

  const top = topStage(stages);
  const close = closeStage(stages);
  const visit = visitStage(stages);
  const pipeline = preCloseStage(stages);

  const leads = top?.count ?? 0;
  // Fechamento comercial: sempre a etapa marcada como `close`. Implantação vem
  // depois dela no funil e, por ser pós-venda, nunca soma contrato nem receita.
  const contracts = close?.count ?? 0;
  const closeRate = ratio(contracts, leads);
  const visitRate = ratio(visit?.count ?? 0, leads);

  // Ciclo comercial: só as etapas anteriores ao fechamento. O tempo de
  // Implantação continua visível etapa a etapa, mas fora do ciclo de venda.
  const commercialCycle = cycleStages(stages);
  const avgCycleDays = commercialCycle.reduce((sum, stage) => sum + stage.avg_days, 0);

  // Projeção: leads parados em cada etapa comercial (não avançaram para a
  // seguinte nem foram perdidos) ponderados pela taxa observada daquela etapa
  // virar contrato no próprio período. Não usa nenhuma probabilidade fixa e,
  // em especial, não usa os percentuais dos nomes do CRM de origem.
  const openStages = stages.filter((stage) => stage.kind === "commercial");
  const projectedRevenue = avgTicket
    ? openStages.reduce((sum, stage, index) => {
        const next = openStages[index + 1] ?? close;
        const stillOpen = Math.max(0, stage.count - (next?.count ?? 0));
        const probability = stage.count > 0 ? ratio(contracts, stage.count) : 0;
        return sum + stillOpen * probability * avgTicket;
      }, 0)
    : 0;

  const monthly = monthlyLeads(context.rows).map(({ label, leads: monthLeads }) => {
    const monthContracts = Math.round(monthLeads * closeRate);
    return {
      month: label,
      leads: monthLeads,
      visits: Math.round(monthLeads * visitRate),
      contracts: monthContracts,
      revenue: monthContracts * avgTicket,
    };
  });

  const byChannel = channelLeads(context.rows);
  const totalChannelLeads = byChannel.reduce((sum, item) => sum + item.leads, 0);
  const sources: CrmSource[] = byChannel.map((item) => ({
    name: item.name,
    leads: item.leads,
    contracts: Math.round(contracts * ratio(item.leads, totalChannelLeads)),
  }));

  return {
    front,
    stages,
    contracts,
    revenue: contracts * avgTicket,
    avg_ticket: avgTicket,
    conversion_rate: leads > 0 ? (contracts * 100) / leads : null,
    avg_cycle_days: avgCycleDays,
    pipeline_value: (pipeline?.count ?? 0) * avgTicket,
    projected_revenue: Math.round(projectedRevenue),
    monthly,
    sources,
    // Negociações individuais só existem dentro do CRM: sem API de leitura não há
    // como listá-las, e inventar nomes seria pior do que declarar a ausência.
    recent: [],
    close_stage: close,
    pipeline_stage: pipeline,
    visit_stage: visit,
  };
}

/** Etapa comercial que mais demora. Pós-venda fica de fora por definição. */
export function slowestCommercialStage(stages: CrmStage[]): CrmStage | null {
  return stages
    .filter((stage) => !isPostSale(stage) && stage.avg_days > 0)
    .reduce<CrmStage | null>((worst, stage) => (worst && worst.avg_days >= stage.avg_days ? worst : stage), null);
}
