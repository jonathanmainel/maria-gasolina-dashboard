import { closeStage, crmStages, cycleStages, isPostSale, preCloseStage, visitStage } from "./crm-stages";
import type { CrmSource, CrmStage, CrmSummary, Front, FrontDaily, ManualFunnelInput, ManualPeriodResults } from "../types";

// ---------------------------------------------------------------------------
// Funil comercial — duas origens que não se misturam
//
// O CRM Elo ainda não tem API de leitura, então tudo aqui vem da entrada manual
// (`lib/manual-inputs.ts`), em dois blocos com naturezas diferentes:
//
//   A) SNAPSHOT do kanban (`ManualFunnelInput.stages`)
//      Quantas oportunidades estão HOJE em cada coluna. É um estoque
//      instantâneo, não uma progressão acumulada no período.
//
//   B) RESULTADO do período (`ManualPeriodResults`)
//      Contratos fechados e receita. Informados à mão, porque não existe jeito
//      de extraí-los do estoque.
//
// O que NÃO pode voltar a existir aqui, porque o snapshot não sustenta:
//
//   - `contracts / leads` como taxa de fechamento. A coluna "Lead" tem os leads
//     que ninguém tocou ainda, não os leads que entraram no período; a coluna
//     "Contrato" tem os cards parados nela agora, não os negócios fechados
//     (um negócio fechado já foi para "Implantação").
//   - `stage.count - next.count` como "quantos ficaram parados". São duas
//     colunas independentes: "Contato" pode ter 1962 cards com "Lead" em 9.
//   - `contracts / stage.count` como probabilidade de avanço da etapa.
//   - taxas de passagem sequenciais entre colunas.
//   - contratos/receita mensais a partir dos leads de mídia × taxa do snapshot.
//   - contratos distribuídos por Meta/Google na proporção dos leads: sem
//     atribuição no CRM, não sabemos de onde veio quem fechou.
//   - projeção de receita ponderada por etapa: não há probabilidade histórica.
//
// Os percentuais dos nomes do CRM de origem (FQC-50%, CONTRATO-100%, …)
// continuam fora de tudo: não são probabilidade, são nomenclatura.
//
// Leads mensais e leads por canal continuam reais — vêm da série de mídia.
// ---------------------------------------------------------------------------

export { crmStageNames } from "./crm-stages";

/** Etapas que aceitam tempo médio no editor manual, já sem a pós-venda contaminar o ciclo. */
export const crmCycleStageNames = (front: Front) => cycleStages(crmStages(front)).map((stage) => stage.name);

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Leads reais por mês, a partir da série diária de mídia já filtrada pela frente. */
function monthlyLeads(rows: FrontDaily[]): Array<{ month: string; leads: number }> {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = row.date.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + row.leads);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, leads]) => ({ month: MONTH_LABELS[Number(key.slice(5, 7)) - 1] ?? key, leads }));
}

/** Leads reais por canal de mídia. Não vira origem de contrato. */
function channelLeads(rows: FrontDaily[]): CrmSource[] {
  const meta = rows.filter((row) => row.channel === "meta_ads").reduce((sum, row) => sum + row.leads, 0);
  const google = rows.filter((row) => row.channel === "google_ads").reduce((sum, row) => sum + row.leads, 0);
  return [
    { name: "Meta Ads", leads: meta },
    { name: "Google Ads", leads: google },
  ].filter((item) => item.leads > 0);
}

export interface CrmContext {
  /** Série diária de mídia da frente no período, para derivar o volume mensal de leads. */
  rows: FrontDaily[];
}

export function buildCrmSummary(
  front: Front,
  input: ManualFunnelInput,
  results: ManualPeriodResults,
  context: CrmContext,
): CrmSummary {
  const definitions = crmStages(front);

  // --- A) SNAPSHOT -------------------------------------------------------
  const stages: CrmStage[] = definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    kind: definition.kind,
    role: definition.role,
    count: Math.max(0, Math.round(input.stages?.[definition.id] ?? 0)),
    avg_days: definition.tracksDays ? Math.max(0, input.stage_days?.[definition.id] ?? 0) : 0,
  }));

  // Oportunidades abertas: cards nas colunas comerciais. O fechamento e a
  // pós-venda ficam de fora — não estão mais em negociação.
  const openOpportunities = stages
    .filter((stage) => stage.kind === "commercial")
    .reduce((sum, stage) => sum + stage.count, 0);

  // Ciclo comercial: só as etapas anteriores ao fechamento. O tempo de
  // Implantação continua visível etapa a etapa, mas fora do ciclo de venda.
  const avgCycleDays = cycleStages(stages).reduce((sum, stage) => sum + stage.avg_days, 0);

  // --- B) RESULTADO DO PERÍODO -------------------------------------------
  const contracts = Math.max(0, Math.round(results?.contracts_closed ?? 0));
  const revenue = Math.max(0, results?.revenue ?? 0);
  // Ticket realizado quando há resultado; senão a referência digitada no funil,
  // deixando claro pela flag qual dos dois está em cena.
  const realized = contracts > 0 && revenue > 0;
  const avgTicket = realized ? revenue / contracts : Math.max(0, input.avg_ticket);

  return {
    front,
    stages,
    open_opportunities: openOpportunities,
    contracts,
    revenue,
    avg_ticket: avgTicket,
    avg_ticket_realized: realized,
    avg_cycle_days: avgCycleDays,
    monthly: monthlyLeads(context.rows),
    sources: channelLeads(context.rows),
    // Negociações individuais só existem dentro do CRM: sem API de leitura não há
    // como listá-las, e inventar nomes seria pior do que declarar a ausência.
    recent: [],
    close_stage: closeStage(stages),
    pipeline_stage: preCloseStage(stages),
    visit_stage: visitStage(stages),
  };
}

/** Etapa comercial que mais demora. Pós-venda fica de fora por definição. */
export function slowestCommercialStage(stages: CrmStage[]): CrmStage | null {
  return stages
    .filter((stage) => !isPostSale(stage) && stage.avg_days > 0)
    .reduce<CrmStage | null>((worst, stage) => (worst && worst.avg_days >= stage.avg_days ? worst : stage), null);
}
