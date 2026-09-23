import type { CrmSource, CrmSummary, Front, FrontDaily, ManualFunnelInput } from "../types";

// ---------------------------------------------------------------------------
// Funil comercial
//
// O CRM Elo ainda não tem API de leitura, então os volumes por etapa, o tempo em
// cada etapa e o ticket médio vêm da entrada manual (`lib/manual-inputs.ts`).
// Tudo o que dá para calcular é calculado aqui e não é pedido ao usuário:
// receita, conversão lead → contrato, ciclo médio, pipeline, projeção ponderada,
// taxas de passagem, evolução mensal e origem dos contratos.
//
// A origem dos contratos e a série mensal usam o volume REAL de leads de mídia
// (Meta Ads e Google Ads) — só a taxa de fechamento vem do bloco manual.
// ---------------------------------------------------------------------------

export const crmStageNames: Record<Front, string[]> = {
  franchise: ["Leads", "Contato realizado", "Perfil validado", "Discovery Day", "Proposta / COF", "Contrato assinado"],
  condominium: ["Indicações", "Contato com síndico", "Visita técnica", "Aprovação em assembleia", "Proposta", "Loja contratada"],
};

export const crmStageDayLabels: Record<Front, string[]> = {
  franchise: crmStageNames.franchise.slice(0, 5),
  condominium: crmStageNames.condominium.slice(0, 5),
};

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
  const names = crmStageNames[front];
  const counts = names.map((_, index) => Math.max(0, Math.round(input.stages[index] ?? 0)));
  const days = input.stage_days.map((value) => Math.max(0, value));
  const avgTicket = Math.max(0, input.avg_ticket);

  const stages = names.map((name, index) => ({
    id: `s${index}`,
    name,
    count: counts[index],
    avg_days: days[index] ?? 0,
  }));

  const top = counts[0];
  const contracts = counts[counts.length - 1];
  const closeRate = ratio(contracts, top);
  const meetingRate = ratio(counts[3] ?? 0, top);

  // Projeção: leads parados em cada etapa (não avançaram nem foram perdidos)
  // ponderados pela probabilidade daquela etapa virar contrato.
  const projectedRevenue = avgTicket
    ? counts.slice(0, counts.length - 1).reduce((sum, count, index) => {
        const stillOpen = Math.max(0, count - (counts[index + 1] ?? 0));
        const probability = count > 0 ? ratio(contracts, count) : 0;
        return sum + stillOpen * probability * avgTicket;
      }, 0)
    : 0;

  const monthly = monthlyLeads(context.rows).map(({ label, leads }) => {
    const monthContracts = Math.round(leads * closeRate);
    return {
      month: label,
      leads,
      meetings: Math.round(leads * meetingRate),
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
    conversion_rate: top > 0 ? (contracts * 100) / top : null,
    avg_cycle_days: days.reduce((sum, value) => sum + value, 0),
    pipeline_value: (counts[4] ?? 0) * avgTicket,
    projected_revenue: Math.round(projectedRevenue),
    monthly,
    sources,
    // Negociações individuais só existem dentro do CRM: sem API de leitura não há
    // como listá-las, e inventar nomes seria pior do que declarar a ausência.
    recent: [],
  };
}
