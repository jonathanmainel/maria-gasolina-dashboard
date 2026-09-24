import type { NumberFieldSpec } from "../components/ui/editable";
import { crmStageNames } from "./crm";
import type { DeliveryStatus, Front, Goals, ManualFunnelInput } from "../types";

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

// Guardados na chave `delivery` do payload manual — mantida para não perder os
// valores já salvos. Alimentam os anéis de entrega do Orgânico e o ritmo do mês.
export const publicationFields: NumberFieldSpec[] = [
  { key: "posts_published", label: "Posts publicados", hint: "Feed do Instagram no mês" },
  { key: "stories_published", label: "Stories publicados", hint: "Instagram no mês" },
];

const stageKey = (index: number) => `stage_${index}`;
const dayKey = (index: number) => `days_${index}`;

/** Campos do funil de uma frente: volume por etapa, dias por etapa e ticket médio. */
export function funnelFields(front: Front): NumberFieldSpec[] {
  const names = crmStageNames[front];
  return [
    ...names.map((name, index) => ({ key: stageKey(index), label: name, hint: index === 0 ? "Topo do funil" : `Volume que chegou em "${name}"` })),
    ...names.slice(0, 5).map((name, index) => ({ key: dayKey(index), label: `Dias em "${name}"`, hint: "Tempo médio de permanência na etapa" })),
    { key: "avg_ticket", label: "Ticket médio do contrato", hint: "Deixe 0 quando a frente não tem taxa direta", kind: "currency" as const },
  ];
}

export function funnelToValues(input: ManualFunnelInput): Record<string, number> {
  const values: Record<string, number> = { avg_ticket: input.avg_ticket };
  input.stages.forEach((count, index) => { values[stageKey(index)] = count; });
  input.stage_days.forEach((days, index) => { values[dayKey(index)] = days; });
  return values;
}

export function valuesToFunnel(front: Front, values: Record<string, number>): ManualFunnelInput {
  const names = crmStageNames[front];
  return {
    stages: names.map((_, index) => values[stageKey(index)] ?? 0),
    stage_days: names.slice(0, 5).map((_, index) => values[dayKey(index)] ?? 0),
    avg_ticket: values.avg_ticket ?? 0,
  };
}

// Conversões diretas: os tipos de negócio são registros planos de números, mas o
// editor trabalha com Record<string, number> — estes wrappers evitam espalhar
// casts pelas telas.
export const goalsToValues = (goals: Goals) => ({ ...goals }) as unknown as Record<string, number>;
export const valuesToGoals = (values: Record<string, number>) => ({ ...values }) as unknown as Goals;
export const deliveryToValues = (delivery: DeliveryStatus) => ({ ...delivery }) as unknown as Record<string, number>;
export const valuesToDelivery = (values: Record<string, number>) => ({ ...values }) as unknown as DeliveryStatus;
