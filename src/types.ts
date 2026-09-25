import type { CrmStageKind, CrmStageRole } from "./lib/crm-stages";

export type Source = "google_ads" | "meta_ads";
export type EntityLevel = "campaign" | "group" | "ad" | "keyword";
export type PmaxLevel = "asset_group" | "asset";
export type DashboardView = "overview" | "google" | "meta" | "analytics";
export type OverviewMetric = "spend" | "results" | "cost_per_result";
export type CampaignScope = "all" | "franchise" | "condominium";

export interface Kpis {
  has_data: boolean;
  spend: number;
  impressions: number;
  reach?: number;
  clicks: number;
  link_clicks?: number;
  results: number;
  all_conversions?: number;
  conversion_value?: number;
  ctr: number | null;
  link_ctr?: number | null;
  cpc: number | null;
  link_cpc?: number | null;
  cpm: number | null;
  cost_per_result: number | null;
}

export interface DailyMetric {
  date: string;
  source: Source;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  results: number;
}

export interface AnalyticsKpis {
  has_data: boolean;
  sessions: number;
  engaged_sessions: number;
  active_users: number;
  new_users: number;
  views: number;
  events: number;
  conversions: number;
  revenue: number;
  generate_leads: number;
  engagement_rate?: number | null;
  views_per_session?: number | null;
  lead_rate?: number | null;
}

export interface AnalyticsDailyMetric {
  date: string;
  sessions: number;
  engaged_sessions: number;
  active_users: number;
  new_users: number;
  views: number;
  events: number;
  conversions: number;
  revenue: number;
  page_views: number;
  scrolls: number;
  generate_leads: number;
}

export interface AnalyticsAcquisitionItem {
  channel_group: string;
  source_medium: string;
  sessions: number;
  engaged_sessions: number;
  new_users: number;
  views: number;
  events: number;
  key_events: number;
  generate_leads: number;
  engagement_rate: number | null;
  lead_rate: number | null;
}

export interface AnalyticsEventItem {
  event_name: string;
  event_count: number;
  daily_average: number;
  key_events: number;
  share_of_total: number | null;
}

/**
 * Uma linha de `get_dashboard_ga4_landing_pages`: a página pela qual a sessão
 * começou, agregada no período. `primary_conversions` (e portanto
 * `conversion_rate`) vem null enquanto a conversão primária não estiver marcada
 * na propriedade — por isso a interface analisa landing page por sessões,
 * engajamento e novos usuários, e não inventa leads por página.
 */
export interface AnalyticsLandingPageItem {
  landing_page: string;
  sessions: number;
  engaged_sessions: number;
  active_users: number;
  new_users: number;
  views: number;
  events: number;
  key_events: number;
  primary_conversions: number | null;
  engagement_rate: number | null;
  conversion_rate: number | null;
}

export interface OverviewResponse {
  client: { id: number; slug: string; name: string; timezone: string };
  period: { start: string; end: string; days: number };
  comparison_period: { start: string; end: string; days: number };
  available_range: { start: string | null; end: string | null };
  last_sync: Record<string, { status: string; completed_at: string; range_start: string; range_end: string }>;
  current: { consolidated: Kpis; sources: Partial<Record<Source, Kpis>> };
  previous: { consolidated: Kpis; sources: Partial<Record<Source, Kpis>> };
  daily: DailyMetric[];
  analytics?: {
    current: AnalyticsKpis;
    previous: AnalyticsKpis;
    daily: AnalyticsDailyMetric[];
  };
}

export interface EntityItem extends Kpis {
  level: EntityLevel;
  source: Source;
  item_id: string;
  item_name: string;
  item_status: string | null;
  keyword_match_type?: string | null;
  parent_id: string | null;
  parent_name: string | null;
}

export interface PmaxItem extends Kpis {
  level: PmaxLevel;
  item_id: string;
  item_name: string;
  item_status: string | null;
  campaign_id: string;
  campaign_name: string;
  asset_group_id: string | null;
  asset_group_name: string | null;
  field_type: string | null;
  performance_label: string | null;
  text_content: string | null;
  image_url: string | null;
  youtube_video_id: string | null;
  ad_strength: string | null;
}

export interface CursorPage<T> {
  items: T[];
  total_count: number;
  next_cursor: Record<string, string | number> | null;
}

export interface DateRange {
  start: string;
  end: string;
}


// ---------------------------------------------------------------------------
// v2 — frentes, orgânico, CRM e metas
// ---------------------------------------------------------------------------

export type Front = "franchise" | "condominium";
export type Channel = "google_ads" | "meta_ads";
export type Platform = "instagram" | "facebook";
export type AppView = "executive" | "franchise" | "condominium" | "organic" | "site" | "crm" | "settings";

export interface FrontDaily {
  date: string;
  front: Front;
  channel: Channel;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
}

export interface FrontTotals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  conv_rate: number | null;
}

export interface CampaignRow {
  id: string;
  name: string;
  front: Front;
  channel: Channel;
  objective: string;
  status: "ACTIVE" | "PAUSED" | "LEARNING" | "REMOVED";
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
}

export interface Creative {
  id: string;
  name: string;
  front: Front;
  channel: Channel;
  format: "video" | "image" | "carousel";
  creative_type?: "image" | "video" | "carousel" | "dynamic" | "unknown";
  preview_url?: string | null;
  headline: string;
  palette: [string, string];
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  hook_rate: number | null;
}

export interface OrganicDaily {
  date: string;
  platform: Platform;
  followers: number;
  new_followers: number;
  unfollows: number;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  dms: number;
  profile_visits: number;
  posts: number;
  stories: number;
}

export interface OrganicPost {
  id: string;
  platform: Platform;
  format: "reel" | "carousel" | "image" | "story";
  caption: string;
  published_at: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  engagement_rate: number;
  palette: [string, string];
}

export interface OrganicSummary {
  platform: Platform;
  followers: number;
  followers_start: number;
  new_followers: number;
  unfollows: number;
  growth_rate: number | null;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  dms: number;
  profile_visits: number;
  engagement_rate: number | null;
  posts: number;
  stories: number;
}

export interface CrmStage {
  /** Id estável da etapa (`lib/crm-stages.ts`), o mesmo usado no payload manual. */
  id: string;
  name: string;
  /** Semântica da etapa: comercial, fechamento ou pós-venda. Nunca a posição. */
  kind: CrmStageKind;
  role?: CrmStageRole;
  /**
   * ESTOQUE ATUAL: quantas oportunidades estão HOJE nesta coluna do kanban.
   * Não é volume acumulado de passagem no período — uma etapa posterior pode
   * ter mais cards que uma anterior, e a diferença entre duas colunas não
   * significa "quantos se perderam".
   */
  count: number;
  avg_days: number;
}

/** Só leads reais de mídia. Contratos e receita mensais não são inferíveis. */
export interface CrmMonthly {
  month: string;
  leads: number;
}

/** Origem dos LEADS de mídia. A origem dos contratos não é conhecida sem atribuição no CRM. */
export interface CrmSource {
  name: string;
  leads: number;
}

/**
 * Duas origens que NÃO se misturam:
 *
 *   A) SNAPSHOT  — `stages`, `open_opportunities`, `pipeline_stage`, `visit_stage`
 *      e os tempos por etapa. Foto do kanban hoje.
 *   B) RESULTADO — `contracts` e `revenue`. Digitados à mão para o período de
 *      referência. Nunca derivados do snapshot.
 *
 * Não existe aqui conversão lead → contrato, projeção de receita, contratos por
 * mês nem origem dos contratos: nenhum deles é calculável a partir de um
 * estoque instantâneo, e inventá-los seria pior do que declarar a ausência.
 */
export interface CrmSummary {
  front: Front;
  /** [SNAPSHOT] Todas as etapas na ordem visual, incluindo a pós-venda. */
  stages: CrmStage[];
  /** [SNAPSHOT] Oportunidades abertas hoje: soma das etapas comerciais antes do fechamento. */
  open_opportunities: number;
  /** [RESULTADO] Contratos fechados no período, informados à mão. */
  contracts: number;
  /** [RESULTADO] Receita do período, informada à mão. */
  revenue: number;
  /** Ticket: realizado (receita ÷ contratos) quando há resultado, senão a referência digitada. */
  avg_ticket: number;
  /** true quando `avg_ticket` veio do resultado do período, não da referência manual. */
  avg_ticket_realized: boolean;
  /** [SNAPSHOT] Soma do tempo médio das etapas até o fechamento. */
  avg_cycle_days: number;
  /** Leads reais de mídia por mês. Sem contratos nem receita inferidos. */
  monthly: CrmMonthly[];
  /** Leads reais por canal de mídia. Não é origem de contrato. */
  sources: CrmSource[];
  recent: Array<{ id: string; name: string; city: string; stage: string; source: string; value: number; updated_at: string }>;
  /** Etapa de fechamento comercial já resolvida, para as telas não procurarem por índice. */
  close_stage: CrmStage | null;
  /** [SNAPSHOT] Última etapa comercial antes do fechamento. */
  pipeline_stage: CrmStage | null;
  /** [SNAPSHOT] Etapa de visita/call da frente, quando existir. */
  visit_stage: CrmStage | null;
}

export interface Goals {
  media_budget: number;
  leads_franchise: number;
  leads_condominium: number;
  cpl_franchise: number;
  cpl_condominium: number;
  posts: number;
  stories: number;
  followers_growth: number;
  contracts_franchise: number;
  contracts_condominium: number;
}

/**
 * Conteúdos publicados no Instagram no mês, preenchidos à mão — sem origem
 * automática ainda. `posts_published`/`stories_published` também alimentam o
 * "Ritmo do mês" (Visão executiva e Apresentação), por isso mantêm o nome.
 */
export interface DeliveryStatus {
  posts_published: number;
  stories_published: number;
  reels_published: number;
  carousel_published: number;
  instant_published: number;
}

// ---------------------------------------------------------------------------
// Base de unidades da rede — contrato de `public.get_dashboard_network_units`
//
// Fonte única do mapa da Visão executiva. As coordenadas vêm resolvidas do
// backend (dataset de municípios fixado por commit/checksum na Edge Function
// `import-network-units`); o frontend só projeta latitude/longitude para o
// sistema x/y do mapa 3D. Nada aqui é digitado à mão ou guardado em JSON.
// ---------------------------------------------------------------------------

export interface NetworkUnit {
  id: number;
  source_row_number: number;
  unit_name: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  normalized_city: string;
  normalized_state: string;
  municipality_ibge_code: number | null;
  municipality_name: string | null;
  latitude: number | null;
  longitude: number | null;
  geography_status: "resolved" | "unresolved";
}

/** Uma linha por cidade, já agrupada pela RPC. `unit_count` é a contagem real. */
export interface NetworkCity {
  city: string;
  /** UF normalizada em caixa alta. */
  state: string;
  normalized_city: string;
  unit_count: number;
  /** Falso quando a cidade não casou com nenhum município: sem coordenadas. */
  resolved: boolean;
  municipality_ibge_code: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface NetworkImportRecord {
  id: number;
  filename: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  unresolved_cities: number;
  created_at: string;
  completed_at: string | null;
}

export interface NetworkUnitsSummary {
  total_units: number;
  total_cities: number;
  unresolved_cities: number;
  last_import_at: string | null;
  last_import: NetworkImportRecord | null;
}

export interface NetworkHeadquarters {
  city: string;
  state: string;
}

export interface NetworkUnitsSnapshot {
  units: NetworkUnit[];
  cities: NetworkCity[];
  summary: NetworkUnitsSummary;
  headquarters: NetworkHeadquarters;
}

/** Cidade pronta para o mapa: coordenada já projetada e sede sinalizada. */
export interface NetworkMapCity {
  key: string;
  city: string;
  state: string;
  unitCount: number;
  x: number;
  y: number;
  isHeadquarters: boolean;
}


// ---------------------------------------------------------------------------
// v3 — entrada manual dos dados de negócio (CRM Elo ainda sem API de leitura)
// ---------------------------------------------------------------------------

/**
 * Foto do kanban do CRM preenchida à mão: quantas oportunidades estão HOJE em
 * cada etapa, e quanto tempo em média elas ficam em cada uma.
 *
 * NÃO é um funil cumulativo. Nada de resultado comercial sai daqui — contratos
 * fechados e receita do período vêm de `ManualPeriodResults`.
 */
export interface ManualFunnelInput {
  /**
   * Volume por etapa, indexado pelo id da etapa em `lib/crm-stages.ts`.
   * Deixou de ser array posicional: o funil de Franquias tem 10 etapas e o de
   * Condomínios 8, e um array não diz qual posição é o fechamento comercial.
   */
  stages: Record<string, number>;
  /** Dias médios de permanência, por id de etapa (só etapas com `tracksDays`). */
  stage_days: Record<string, number>;
  /**
   * Ticket de referência do contrato, em BRL. 0 quando a frente não tem taxa
   * direta. Serve de referência quando não há resultado informado no período —
   * o ticket exibido passa a ser receita ÷ contratos assim que houver.
   */
  avg_ticket: number;
}

/**
 * RESULTADO COMERCIAL do período de referência, digitado à mão.
 *
 * Existe separado do funil de propósito: a coluna "Contrato" do kanban mostra
 * quantos cards estão parados nela agora, não quantos negócios foram fechados —
 * um negócio fechado normalmente já saiu dela para "Implantação". Sem API do
 * CRM, o número de fechamentos e o faturamento só podem ser informados.
 */
export interface ManualPeriodResults {
  /** Contratos fechados no período. Ausente = 0, nunca inferido do snapshot. */
  contracts_closed: number;
  /** Receita do período, em BRL. Ausente = 0, nunca inferida. */
  revenue: number;
}

/** Bloco único de dados de negócio manuais, persistido por cliente. */
export interface ManualBusinessData {
  goals: Goals;
  /** [SNAPSHOT] Foto do kanban por frente. */
  funnel: Record<Front, ManualFunnelInput>;
  /** [RESULTADO] Fechamentos e receita do período por frente. */
  results: Record<Front, ManualPeriodResults>;
  delivery: DeliveryStatus;
}

export type ManualStorage = "supabase" | "local";
