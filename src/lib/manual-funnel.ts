import { crmStages, cycleStages } from "./crm-stages";
import type { Front, ManualFunnelInput } from "../types";

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
 * Mapa índice legado → id da etapa atual. O que não está aqui é descartado:
 *
 *   Franquias   · "Perfil validado" (2), "Discovery Day" (3) e "Proposta / COF" (4)
 *                 não têm equivalente seguro. O CRM real quebra essa faixa em
 *                 Recall, FQC, Visita/Call, COF, Pré-contrato e Espera, e não dá
 *                 para dizer em qual delas o volume antigo estava.
 *   Condomínios · "Visita técnica" (2) e "Proposta" (4) idem: "Visita / Proposta"
 *                 é uma etapa só no CRM real e juntaria dois volumes distintos.
 *
 * Os tempos por etapa (5 posições, alinhadas às 5 primeiras do modelo antigo)
 * seguem exatamente o mesmo mapa, para que volume e tempo não divirjam.
 */
export const legacyStageMap: Record<Front, Record<number, string>> = {
  franchise: { 0: "lead", 1: "contact", 5: "contract" },
  condominium: { 0: "lead", 1: "contact", 3: "assembly", 5: "contract" },
};

/**
 * Padrões do funil. Vieram de aplicar `legacyStageMap` aos números ilustrativos
 * que o dashboard já trazia — as etapas do CRM real que nunca tiveram medição
 * começam em 0, sem inventar distribuição comercial.
 */
export const defaultFunnel: Record<Front, ManualFunnelInput> = {
  franchise: {
    stages: { lead: 420, contact: 260, recall: 0, fqc: 0, visit_call: 0, cof: 0, pre_contract: 0, waiting: 0, contract: 18, implementation: 0 },
    stage_days: { lead: 3, contact: 6, recall: 0, fqc: 0, visit_call: 0, cof: 0, pre_contract: 0, waiting: 0, implementation: 0 },
    avg_ticket: 84500,
  },
  condominium: {
    stages: { lead: 180, contact: 126, recall: 0, fqa: 0, visit_proposal: 0, assembly: 49, contract: 16, implementation: 0 },
    stage_days: { lead: 5, contact: 9, recall: 0, fqa: 0, visit_proposal: 0, assembly: 16, implementation: 0 },
    avg_ticket: 0,
  },
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
