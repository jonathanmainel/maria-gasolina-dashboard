import type { NumberFieldSpec } from "../components/ui/editable";
import { closeStage, crmStages, isCommercialClose, isPostSale } from "./crm-stages";
import type { DeliveryStatus, Front, Goals, ManualFunnelInput, ManualPeriodResults } from "../types";

// Descrição dos campos manuais em um só lugar: os mesmos rótulos valem para o
// editor em Metas e ajustes e para o editor do funil dentro de CRM e vendas.

export const goalFields: NumberFieldSpec[] = [
  { key: "media_budget", label: "Verba de mídia mensal", hint: "Teto contratual: R$ 50.000", kind: "currency" },
  { key: "leads_franchise", label: "Meta de leads · Franquias", hint: "Candidatos a franqueado por mês" },
  { key: "leads_condominium", label: "Meta de leads · Condomínios", hint: "Indicações de condomínio por mês" },
  { key: "cpl_franchise", label: "CPL alvo · Franquias", hint: "Custo máximo aceitável por lead", kind: "currency" },
  { key: "cpl_condominium", label: "CPL alvo · Condomínios", hint: "Custo máximo aceitável por lead", kind: "currency" },
  { key: "posts", label: "Posts no feed por mês", hint: "Contrato: 20" },
  { key: "stories", label: "Stories por mês", hint: "Contrato: 20" },
  { key: "followers_growth", label: "Novos seguidores por mês", hint: "Instagram + Facebook" },
  { key: "contracts_franchise", label: "Contratos de franquia por mês", hint: "Meta comercial (CRM)" },
  { key: "contracts_condominium", label: "Lojas em condomínio por mês", hint: "Meta comercial (CRM)" },
];

// Guardados na chave `delivery` do payload manual. `posts_published` e
// `stories_published` também alimentam o "Ritmo do mês" (Visão executiva e
// Apresentação), por isso os nomes das chaves não mudam — só o rótulo, aqui,
// reflete o tipo de conteúdo.
export const publicationFields: NumberFieldSpec[] = [
  { key: "posts_published", label: "Feed", hint: "Publicações no feed do Instagram no mês" },
  { key: "stories_published", label: "Stories", hint: "Stories publicados no mês" },
  { key: "reels_published", label: "Reels", hint: "Reels publicados no mês" },
  { key: "carousel_published", label: "Carrossel", hint: "Carrosséis publicados no mês" },
  { key: "instant_published", label: "Instant", hint: "Publicações Instant no mês" },
];

// Campos do funil: um por etapa (quantos cards estão nela AGORA), um por etapa
// com tempo (dias) e o ticket de referência. As chaves carregam o id da etapa,
// não a posição — assim Franquias (10 etapas) e Condomínios (8) usam o mesmo
// editor sem números mágicos.
//
// Contratos fechados e receita NÃO estão aqui: são resultado do período e têm
// bloco próprio (`resultFields`), porque não saem do estoque do kanban.
const stageKey = (id: string) => `stage_${id}`;
const dayKey = (id: string) => `days_${id}`;

/** Campos do funil de uma frente: volume por etapa, dias por etapa e ticket médio. */
export function funnelFields(front: Front): NumberFieldSpec[] {
  const stages = crmStages(front);
  const close = closeStage(stages);
  return [
    ...stages.map((stage, index) => ({
      key: stageKey(stage.id),
      label: stage.name,
      hint: isCommercialClose(stage)
        ? "Cards parados na coluna de fechamento agora — não é o total fechado no período"
        : isPostSale(stage)
          ? `Pós-venda, depois de "${close?.name ?? "Contrato"}" — não conta como contrato`
          : `Oportunidades hoje em "${stage.name}"`,
      group: index === 0 ? "Oportunidades hoje por etapa" : undefined,
    })),
    ...stages.filter((stage) => stage.tracksDays).map((stage, index) => ({
      key: dayKey(stage.id),
      label: stage.name,
      hint: isPostSale(stage) ? "Tempo de implantação — fora do ciclo comercial" : "Tempo médio de permanência na etapa",
      group: index === 0 ? "Tempo médio por etapa (dias)" : undefined,
    })),
    { key: "avg_ticket", label: "Ticket de referência do contrato", hint: "Usado enquanto não houver receita do período informada. 0 quando a frente não tem taxa direta", kind: "currency" as const, group: "Referência" },
  ];
}

/**
 * Resultado comercial do período — bloco curto e separado do funil de
 * propósito, para deixar explícito que estes números são digitados e não saem
 * da foto do kanban.
 */
export function resultFields(front: Front): NumberFieldSpec[] {
  const unit = front === "franchise" ? "franquia" : "condomínio";
  return [
    { key: "contracts_closed", label: "Contratos fechados no período", hint: `Negócios de ${unit} efetivamente fechados — não é a ocupação da coluna "Contrato"` },
    { key: "revenue", label: "Receita do período", hint: "Faturamento reconhecido no período. Deixe 0 quando a frente não tem taxa direta", kind: "currency" as const },
  ];
}

export const resultsToValues = (results: ManualPeriodResults) => ({ ...results }) as unknown as Record<string, number>;
export const valuesToResults = (values: Record<string, number>): ManualPeriodResults => ({
  contracts_closed: Math.max(0, Math.round(values.contracts_closed ?? 0)),
  revenue: Math.max(0, values.revenue ?? 0),
});

export function funnelToValues(front: Front, input: ManualFunnelInput): Record<string, number> {
  const values: Record<string, number> = { avg_ticket: input.avg_ticket };
  crmStages(front).forEach((stage) => {
    values[stageKey(stage.id)] = input.stages[stage.id] ?? 0;
    if (stage.tracksDays) values[dayKey(stage.id)] = input.stage_days[stage.id] ?? 0;
  });
  return values;
}

export function valuesToFunnel(front: Front, values: Record<string, number>): ManualFunnelInput {
  const stages: Record<string, number> = {};
  const stageDays: Record<string, number> = {};
  crmStages(front).forEach((stage) => {
    stages[stage.id] = values[stageKey(stage.id)] ?? 0;
    if (stage.tracksDays) stageDays[stage.id] = values[dayKey(stage.id)] ?? 0;
  });
  return { stages, stage_days: stageDays, avg_ticket: values.avg_ticket ?? 0 };
}

// Conversões diretas: os tipos de negócio são registros planos de números, mas o
// editor trabalha com Record<string, number> — estes wrappers evitam espalhar
// casts pelas telas.
export const goalsToValues = (goals: Goals) => ({ ...goals }) as unknown as Record<string, number>;
export const valuesToGoals = (values: Record<string, number>) => ({ ...values }) as unknown as Goals;
export const deliveryToValues = (delivery: DeliveryStatus) => ({ ...delivery }) as unknown as Record<string, number>;
export const valuesToDelivery = (values: Record<string, number>) => ({ ...values }) as unknown as DeliveryStatus;
