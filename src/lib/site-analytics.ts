import { monthLabel } from "./metrics";
import type { AnalyticsAcquisitionItem, AnalyticsDailyMetric, AnalyticsEventItem, AnalyticsKpis, AnalyticsLandingPageItem } from "../types";

// ---------------------------------------------------------------------------
// Aba Site — agregação e leitura dos dados do GA4.
//
// Decisão que vale para todo o arquivo: taxa nunca é média de taxas. Tanto a
// taxa de engajamento quanto a taxa de conversão são sempre recalculadas a
// partir dos totais somados do agrupamento (soma / soma). Fazer a média das
// taxas diárias daria o mesmo peso a um dia de 3 sessões e a um de 300.
//
// Nomenclatura da interface (decisão de produto do MVP): o campo do backend
// `generate_leads` é exibido como "Leads" e `lead_rate` como "Taxa de
// conversão". O evento que alimenta esse número é o `form_submit` do GA4.
// ---------------------------------------------------------------------------

/** Nome do evento do GA4 que representa um Lead nesta versão do dashboard. */
export const LEAD_EVENT = "form_submit";

export interface SiteBucket {
  /** Chave estável de ordenação (data ISO, ou YYYY-MM no mensal). */
  key: string;
  /** Rótulo curto do eixo X. */
  label: string;
  sessions: number;
  engaged_sessions: number;
  new_users: number;
  views: number;
  events: number;
  generate_leads: number;
  engagement_rate: number | null;
  lead_rate: number | null;
}

const dayLabel = (date: string) => date.slice(5).split("-").reverse().join("/");

function finish(key: string, label: string, sum: Omit<SiteBucket, "key" | "label" | "engagement_rate" | "lead_rate">): SiteBucket {
  return {
    key,
    label,
    ...sum,
    engagement_rate: sum.sessions ? (sum.engaged_sessions * 100) / sum.sessions : null,
    lead_rate: sum.sessions ? (sum.generate_leads * 100) / sum.sessions : null,
  };
}

const emptySum = () => ({ sessions: 0, engaged_sessions: 0, new_users: 0, views: 0, events: 0, generate_leads: 0 });

function add(target: ReturnType<typeof emptySum>, day: AnalyticsDailyMetric) {
  target.sessions += day.sessions;
  target.engaged_sessions += day.engaged_sessions;
  target.new_users += day.new_users;
  target.views += day.views;
  target.events += day.events;
  target.generate_leads += day.generate_leads;
  return target;
}

/** Ordena a série por data e descarta duplicatas do mesmo dia somando-as. */
function normalizeDaily(daily: AnalyticsDailyMetric[]) {
  const map = new Map<string, ReturnType<typeof emptySum>>();
  daily.forEach((day) => { map.set(day.date, add(map.get(day.date) ?? emptySum(), day)); });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Série diária: um ponto por dia, direto de `analytics.daily`. */
export function siteDailySeries(daily: AnalyticsDailyMetric[]): SiteBucket[] {
  return normalizeDaily(daily).map(([date, sum]) => finish(date, dayLabel(date), sum));
}

/**
 * Série semanal em blocos de 7 dias contados do início do período — o mesmo
 * critério já usado nos gráficos das frentes, para as duas telas não darem
 * "semanas" diferentes para o mesmo intervalo. O rótulo é o primeiro dia do
 * bloco. Um bloco final incompleto continua aparecendo, com os dias que tem.
 */
export function siteWeeklySeries(daily: AnalyticsDailyMetric[]): SiteBucket[] {
  const days = normalizeDaily(daily);
  const weeks: SiteBucket[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    const sum = chunk.reduce((acc, [, value]) => {
      acc.sessions += value.sessions; acc.engaged_sessions += value.engaged_sessions;
      acc.new_users += value.new_users; acc.views += value.views;
      acc.events += value.events; acc.generate_leads += value.generate_leads;
      return acc;
    }, emptySum());
    weeks.push(finish(chunk[0][0], dayLabel(chunk[0][0]), sum));
  }
  return weeks;
}

/** Série mensal agrupada por mês de calendário (chave YYYY-MM). */
export function siteMonthlySeries(daily: AnalyticsDailyMetric[]): SiteBucket[] {
  const months = new Map<string, ReturnType<typeof emptySum>>();
  daily.forEach((day) => {
    const key = day.date.slice(0, 7);
    months.set(key, add(months.get(key) ?? emptySum(), day));
  });
  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, sum]) => finish(key, monthLabel(key), sum));
}

export type ChartMode = "daily" | "weekly" | "monthly";

export function siteSeries(daily: AnalyticsDailyMetric[], mode: ChartMode): SiteBucket[] {
  if (mode === "weekly") return siteWeeklySeries(daily);
  if (mode === "monthly") return siteMonthlySeries(daily);
  return siteDailySeries(daily);
}

// ------------------------------------------------------------------ canais

export interface ChannelPerformance {
  channel: string;
  sessions: number;
  engaged_sessions: number;
  new_users: number;
  generate_leads: number;
  engagement_rate: number | null;
  lead_rate: number | null;
  /** Fatia das sessões totais do período, em %. */
  session_share: number | null;
  /** Fatia dos leads totais do período, em %. */
  lead_share: number | null;
}

/**
 * Colapsa as linhas de aquisição (canal × origem/mídia) em um registro por
 * canal do GA4, ordenado por sessões. As taxas saem dos totais do canal.
 */
export function channelPerformance(items: AnalyticsAcquisitionItem[]): ChannelPerformance[] {
  const map = new Map<string, { sessions: number; engaged_sessions: number; new_users: number; generate_leads: number }>();
  items.forEach((item) => {
    const key = item.channel_group || "(not set)";
    const entry = map.get(key) ?? { sessions: 0, engaged_sessions: 0, new_users: 0, generate_leads: 0 };
    entry.sessions += item.sessions;
    entry.engaged_sessions += item.engaged_sessions;
    entry.new_users += item.new_users;
    entry.generate_leads += item.generate_leads;
    map.set(key, entry);
  });
  const totalSessions = [...map.values()].reduce((sum, entry) => sum + entry.sessions, 0);
  const totalLeads = [...map.values()].reduce((sum, entry) => sum + entry.generate_leads, 0);
  return [...map.entries()]
    .map(([channel, entry]) => ({
      channel,
      ...entry,
      engagement_rate: entry.sessions ? (entry.engaged_sessions * 100) / entry.sessions : null,
      lead_rate: entry.sessions ? (entry.generate_leads * 100) / entry.sessions : null,
      session_share: totalSessions ? (entry.sessions * 100) / totalSessions : null,
      lead_share: totalLeads ? (entry.generate_leads * 100) / totalLeads : null,
    }))
    .sort((a, b) => b.sessions - a.sessions || a.channel.localeCompare(b.channel, "pt-BR"));
}

// ----------------------------------------------------------- landing pages

/** Top N landing pages por sessões, para o bloco de barras horizontais. */
export function topLandingPages(items: AnalyticsLandingPageItem[], limit = 5) {
  const total = items.reduce((sum, item) => sum + item.sessions, 0);
  return [...items]
    .sort((a, b) => b.sessions - a.sessions || a.landing_page.localeCompare(b.landing_page, "pt-BR"))
    .slice(0, limit)
    .map((item) => ({ ...item, session_share: total ? (item.sessions * 100) / total : null }));
}

// ----------------------------------------------------------------- eventos

const EVENT_LABELS: Record<string, string> = {
  [LEAD_EVENT]: "Leads",
  form_start: "Formulários iniciados",
  click: "Cliques em links",
  scroll: "Rolagens de página",
  page_view: "Páginas visualizadas",
  session_start: "Sessões iniciadas",
  view_search_results: "Buscas no site",
  file_download: "Downloads",
  video_start: "Vídeos iniciados",
};

/** Ordem de preferência dos cards executivos: Lead primeiro, depois intenção. */
const HIGHLIGHT_ORDER = [LEAD_EVENT, "form_start", "click", "scroll", "view_search_results", "file_download", "video_start"];

export interface EventHighlight {
  event_name: string;
  label: string;
  count: number;
  daily_average: number;
  share_of_total: number | null;
  /** Verdadeiro só para o evento que a interface trata como Lead. */
  isLead: boolean;
}

/**
 * Destaques executivos dos eventos do site. Só entra evento que existe de fato
 * nos dados do período — nada de card fixo com zero. `form_submit` aparece
 * como "Leads", sem o nome técnico: o nome cru continua disponível na tabela.
 */
export function eventHighlights(items: AnalyticsEventItem[], limit = 4): EventHighlight[] {
  const found = new Map(items.map((item) => [item.event_name, item]));
  return HIGHLIGHT_ORDER
    .map((name) => found.get(name))
    .filter((item): item is AnalyticsEventItem => Boolean(item) && (item as AnalyticsEventItem).event_count > 0)
    .slice(0, limit)
    .map((item) => ({
      event_name: item.event_name,
      label: EVENT_LABELS[item.event_name] ?? item.event_name,
      count: item.event_count,
      daily_average: item.daily_average,
      share_of_total: item.share_of_total,
      isLead: item.event_name === LEAD_EVENT,
    }));
}
