import { crmStages, cycleStages } from "./crm-stages";
import type { Front, ManualFunnelInput, ManualPeriodResults } from "../types";

// ---------------------------------------------------------------------------
// Persistência do funil manual: formato atual, padrões e migração do legado
//
// O payload salvo em `dashboard_manual_inputs` guardava o funil como dois
// arrays posicionais (6 volumes e 5 tempos) de um modelo de 6 etapas que não
// existe no CRM real. Agora os dois funis têm tamanhos diferentes (Franquias 10,
// Condomínios 8) e o significado de cada etapa vem do id, não da posição — um
// array não sabe dizer qual posição é o fechamento comercial.
//
// Payloads antigos continuam carregando: um array é reconhecido pelo formato e
// convertido pelo mapa conservador abaixo. Nada é inferido "por parecido":
// etapas do modelo antigo sem equivalente semântico claro no CRM real são
// descartadas de forma explícita, e a etapa nova entra em 0 em vez de herdar um
// volume que nunca foi medido para ela.
// ---------------------------------------------------------------------------

/**
 * Modelo antigo, na ordem em que era persistido:
 *
 *   Franquias:   Leads · Contato realizado · Perfil validado · Discovery Day ·
 *                Proposta / COF · Contrato assinado
 *   Condomínios: Indicações · Contato com síndico · Visita técnica ·
 *                Aprovação em assembleia · Proposta · Loja contratada
 *
 * Mapa índice legado → id da etapa atual do SNAPSHOT. O que não está aqui é
 * descartado:
 *
 *   Franquias   · "Perfil validado" (2), "Discovery Day" (3) e "Proposta / COF" (4)
 *                 não têm equivalente seguro. O CRM real quebra essa faixa em
 *                 Recall, FQC, Visita/Call, COF, Pré-contrato e Espera, e não dá
 *                 para dizer em qual delas o volume antigo estava.
 *   Condomínios · "Visita técnica" (2) e "Proposta" (4) idem: "Visita / Proposta"
 *                 é uma etapa só no CRM real e juntaria dois volumes distintos.
 *   Ambas       · a posição 5 ("Contrato assinado" / "Loja contratada") NÃO vai
 *                 para a coluna "Contrato": ela era contagem de fechamento, e
 *                 vai para o bloco de resultado do período (`normalizeResults`).
 *
 * Os tempos por etapa (5 posições, alinhadas às 5 primeiras do modelo antigo)
 * seguem exatamente o mesmo mapa, para que volume e tempo não divirjam.
 */
export const legacyStageMap: Record<Front, Record<number, string>> = {
  franchise: { 0: "lead", 1: "contact" },
  condominium: { 0: "lead", 1: "contact", 3: "assembly" },
};

/**
 * A última posição do modelo antigo ("Contrato assinado" / "Loja contratada")
 * era, na cabeça de quem digitava, o número de negócios FECHADOS — não a
 * ocupação atual da coluna "Contrato". Por isso ela migra para o bloco de
 * resultado do período, e a coluna "Contrato" do snapshot começa em 0: o
 * estoque de cards parados nela não era medido no modelo antigo.
 */
const LEGACY_CLOSED_INDEX = 5;

/**
 * Snapshot inicial: foto do kanban usada enquanto o CRM não tem integração
 * automática. São números manuais e provisórios, escolhidos para o dashboard
 * fazer sentido em apresentação — e continuam 100% editáveis na tela
 * "CRM e vendas", que sobrescreve tudo isto no primeiro salvamento.
 *
 * Continua sendo ESTOQUE, não funil acumulado: "Contato" tem mais cards que
 * "Lead" porque leads novos são despachados rápido e o contato se acumula, e
 * "Implantação" tem mais que "Contrato" porque o card sai da coluna de
 * fechamento assim que a implantação começa.
 */
export const defaultFunnel: Record<Front, ManualFunnelInput> = {
  franchise: {
    stages: { lead: 24, contact: 68, recall: 31, fqc: 22, visit_call: 14, cof: 11, pre_contract: 7, waiting: 4, contract: 3, implementation: 18 },
    stage_days: { lead: 1, contact: 2, recall: 3, fqc: 4, visit_call: 5, cof: 6, pre_contract: 4, waiting: 3, implementation: 12 },
    avg_ticket: 84500,
  },
  condominium: {
    stages: { lead: 15, contact: 42, recall: 18, fqa: 14, visit_proposal: 11, assembly: 6, contract: 2, implementation: 9 },
    stage_days: { lead: 1, contact: 2, recall: 3, fqa: 4, visit_proposal: 5, assembly: 7, implementation: 10 },
    avg_ticket: 0,
  },
};

/**
 * Resultado do período, também manual e provisório. Independente do snapshot
 * de propósito: Franquias mostra 9 contratos fechados no período mesmo com
 * apenas 3 cards parados na coluna "Contrato" e 18 em "Implantação" — são
 * conceitos diferentes, e nenhum dos dois é calculado a partir do outro.
 *
 * O ticket exibido é derivado daqui (receita ÷ contratos): R$ 84.500 em
 * Franquias e R$ 18.000 em Condomínios.
 */
export const defaultResults: Record<Front, ManualPeriodResults> = {
  franchise: { contracts_closed: 9, revenue: 760500 },
  condominium: { contracts_closed: 6, revenue: 108000 },
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number) => Math.max(0, value);

/** Ids válidos para volume (todas as etapas) e para tempo (só as que aceitam dias). */
const volumeIds = (front: Front) => crmStages(front).map((stage) => stage.id);
const dayIds = (front: Front) => crmStages(front).filter((stage) => stage.tracksDays).map((stage) => stage.id);

function fromLegacyArrays(front: Front, stages: number[], days: number[]): ManualFunnelInput {
  const map = legacyStageMap[front];
  const out: ManualFunnelInput = { stages: {}, stage_days: {}, avg_ticket: 0 };
  volumeIds(front).forEach((id) => { out.stages[id] = 0; });
  dayIds(front).forEach((id) => { out.stage_days[id] = 0; });
  Object.entries(map).forEach(([index, id]) => {
    const position = Number(index);
    const volume = stages[position];
    if (isFiniteNumber(volume)) out.stages[id] = clamp(Math.round(volume));
    const day = days[position];
    if (isFiniteNumber(day) && id in out.stage_days) out.stage_days[id] = clamp(day);
  });
  return out;
}

function fromRecord(front: Front, stages: Record<string, unknown>, days: Record<string, unknown>): ManualFunnelInput {
  const out: ManualFunnelInput = { stages: {}, stage_days: {}, avg_ticket: 0 };
  // Etapa ausente no payload é etapa que ainda não existia quando ele foi salvo:
  // entra em 0, nunca no número ilustrativo do padrão.
  volumeIds(front).forEach((id) => { out.stages[id] = isFiniteNumber(stages[id]) ? clamp(Math.round(stages[id])) : 0; });
  dayIds(front).forEach((id) => { out.stage_days[id] = isFiniteNumber(days[id]) ? clamp(days[id]) : 0; });
  return out;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Normaliza o funil de uma frente vindo do banco/localStorage:
 * registro por id (formato atual), arrays posicionais (formato antigo, migrado)
 * ou nada reconhecível (padrão da frente).
 */
export function normalizeFunnel(front: Front, raw: unknown): ManualFunnelInput {
  const fallback = defaultFunnel[front];
  const partial = (raw ?? {}) as { stages?: unknown; stage_days?: unknown; avg_ticket?: unknown };
  const ticket = isFiniteNumber(partial.avg_ticket) ? clamp(partial.avg_ticket) : fallback.avg_ticket;

  if (isRecord(partial.stages) && Object.keys(partial.stages).length > 0) {
    const days = isRecord(partial.stage_days) ? partial.stage_days : {};
    return { ...fromRecord(front, partial.stages, days), avg_ticket: ticket };
  }
  if (Array.isArray(partial.stages)) {
    const days = Array.isArray(partial.stage_days) ? (partial.stage_days as number[]) : [];
    return { ...fromLegacyArrays(front, partial.stages as number[], days), avg_ticket: ticket };
  }
  return { stages: { ...fallback.stages }, stage_days: { ...fallback.stage_days }, avg_ticket: ticket };
}

/** Nomes das etapas que entram no ciclo comercial de uma frente. */
export const funnelCycleStages = (front: Front) => cycleStages(crmStages(front));

/**
 * Normaliza o resultado comercial de uma frente.
 *
 * `rawFunnel` entra só para a migração: num payload do modelo antigo, o total
 * de contratos assinados ficava na última posição do array de etapas. Fora
 * desse caso nada é inferido — campo ausente vira 0, e a receita do período
 * nunca é reconstruída a partir de contratos × ticket.
 */
export function normalizeResults(front: Front, raw: unknown, rawFunnel?: unknown): ManualPeriodResults {
  const partial = (raw ?? {}) as { contracts_closed?: unknown; revenue?: unknown };
  if (isFiniteNumber(partial.contracts_closed) || isFiniteNumber(partial.revenue)) {
    return {
      contracts_closed: isFiniteNumber(partial.contracts_closed) ? clamp(Math.round(partial.contracts_closed)) : 0,
      revenue: isFiniteNumber(partial.revenue) ? clamp(partial.revenue) : 0,
    };
  }
  const legacyStages = (rawFunnel as { stages?: unknown } | undefined)?.stages;
  if (Array.isArray(legacyStages)) {
    const closed = legacyStages[LEGACY_CLOSED_INDEX];
    if (isFiniteNumber(closed)) return { contracts_closed: clamp(Math.round(closed)), revenue: 0 };
  }
  return { ...defaultResults[front] };
}
