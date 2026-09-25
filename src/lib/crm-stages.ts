import type { Front } from "../types";

// ---------------------------------------------------------------------------
// Definição central das etapas do CRM
//
// Os dois funis reais da Maria Gasolina têm quantidades diferentes de etapas
// (Franquias: 10, Condomínios: 8) e nenhuma tela pode voltar a deduzir o
// significado de uma etapa pela posição dela no array. Tudo o que o dashboard
// precisa saber sobre uma etapa — se ela é o fechamento comercial, se é
// pós-venda, se entra no ciclo de venda, se é a visita — está aqui.
//
// Os nomes do CRM de origem carregam percentuais ("FQC-50%", "CONTRATO-100%").
// Eles NÃO são probabilidade, peso de pipeline nem taxa de passagem: fazem
// parte apenas da organização interna do CRM. Por isso não aparecem nos rótulos
// e nada neste arquivo (ou derivado dele) é calculado a partir deles.
// ---------------------------------------------------------------------------

export type CrmStageKind =
  /** Etapa do processo comercial, antes do fechamento. */
  | "commercial"
  /** Fechamento comercial: é esta etapa que define contratos, receita e conversão. */
  | "close"
  /** Depois do contrato assinado. Visível no funil, fora de todo KPI comercial. */
  | "post_sale";

/**
 * Papel adicional que outras telas precisam localizar sem contar posições.
 * `top` é a entrada do funil (base da conversão) e `visit` é a etapa de
 * visita/call — o equivalente mais próximo de "reunião" que existe nas duas
 * frentes, com nomes diferentes em cada uma.
 */
export type CrmStageRole = "top" | "visit";

export interface CrmStageDefinition {
  /** Chave estável usada no payload manual persistido. Nunca muda de nome. */
  id: string;
  /** Rótulo exibido na interface, sem os percentuais do CRM de origem. */
  name: string;
  kind: CrmStageKind;
  /** A etapa aceita tempo médio de permanência no editor manual. */
  tracksDays: boolean;
  role?: CrmStageRole;
}

/**
 * Ordem exata dos dois funis. A ordem do array é a ordem visual do funil — a
 * única coisa que a posição ainda determina.
 */
export const crmStageDefinitions: Record<Front, CrmStageDefinition[]> = {
  franchise: [
    { id: "lead", name: "Lead", kind: "commercial", tracksDays: true, role: "top" },
    { id: "contact", name: "Contato", kind: "commercial", tracksDays: true },
    { id: "recall", name: "Recall", kind: "commercial", tracksDays: true },
    { id: "fqc", name: "FQC", kind: "commercial", tracksDays: true },
    { id: "visit_call", name: "Visita / Call", kind: "commercial", tracksDays: true, role: "visit" },
    { id: "cof", name: "COF", kind: "commercial", tracksDays: true },
    { id: "pre_contract", name: "Pré-contrato", kind: "commercial", tracksDays: true },
    { id: "waiting", name: "Espera", kind: "commercial", tracksDays: true },
    { id: "contract", name: "Contrato", kind: "close", tracksDays: false },
    { id: "implementation", name: "Implantação", kind: "post_sale", tracksDays: true },
  ],
  condominium: [
    { id: "lead", name: "Lead", kind: "commercial", tracksDays: true, role: "top" },
    { id: "contact", name: "Contato", kind: "commercial", tracksDays: true },
    { id: "recall", name: "Recall", kind: "commercial", tracksDays: true },
    { id: "fqa", name: "FQA", kind: "commercial", tracksDays: true },
    { id: "visit_proposal", name: "Visita / Proposta", kind: "commercial", tracksDays: true, role: "visit" },
    { id: "assembly", name: "Assembleia", kind: "commercial", tracksDays: true },
    { id: "contract", name: "Contrato", kind: "close", tracksDays: false },
    { id: "implementation", name: "Implantação", kind: "post_sale", tracksDays: true },
  ],
};

/** Qualquer objeto que carregue a semântica da etapa — definição ou etapa já calculada. */
type StageLike = { id: string; kind: CrmStageKind; role?: CrmStageRole };

export const isCommercialClose = (stage: StageLike) => stage.kind === "close";
export const isPostSale = (stage: StageLike) => stage.kind === "post_sale";
/** Tudo o que acontece até o contrato, inclusive ele: o processo comercial. */
export const isCommercialStage = (stage: StageLike) => stage.kind !== "post_sale";

export const crmStages = (front: Front) => crmStageDefinitions[front];

/** Rótulos na ordem do funil. Usado por rotulagem e testes de nomenclatura. */
export const crmStageNames = (front: Front) => crmStages(front).map((stage) => stage.name);

/** Entrada do funil: denominador da conversão e base da série mensal. */
export function topStage<T extends StageLike>(stages: T[]): T {
  return stages.find((stage) => stage.role === "top") ?? stages[0];
}

/** O fechamento comercial. Nunca é a última etapa: Implantação vem depois. */
export function closeStage<T extends StageLike>(stages: T[]): T | null {
  return stages.find(isCommercialClose) ?? null;
}

/** Etapa de visita/call da frente, quando existir. */
export function visitStage<T extends StageLike>(stages: T[]): T | null {
  return stages.find((stage) => stage.role === "visit") ?? null;
}

/**
 * Última etapa comercial antes do fechamento — o volume que está de fato em
 * negociação aberta e sustenta o card de pipeline.
 */
export function preCloseStage<T extends StageLike>(stages: T[]): T | null {
  const closeIndex = stages.findIndex(isCommercialClose);
  if (closeIndex <= 0) return null;
  for (let index = closeIndex - 1; index >= 0; index -= 1) {
    if (stages[index].kind === "commercial") return stages[index];
  }
  return null;
}

/** Etapas que compõem o ciclo comercial: pré-fechamento, sem pós-venda. */
export function cycleStages<T extends StageLike & { tracksDays?: boolean }>(stages: T[]): T[] {
  return stages.filter((stage) => stage.kind === "commercial" && stage.tracksDays !== false);
}
