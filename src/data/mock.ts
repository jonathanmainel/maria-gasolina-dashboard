import type { AnalyticsAcquisitionItem, AnalyticsDailyMetric, AnalyticsEventItem, AnalyticsKpis, CursorPage, EntityItem, OverviewResponse, PmaxItem } from "../types";

const kpis = (spend: number, impressions: number, clicks: number, results: number, reach?: number) => ({
  has_data: true,
  spend,
  impressions,
  reach,
  clicks,
  link_clicks: Math.round(clicks * 0.58),
  results,
  all_conversions: results,
  conversion_value: 0,
  ctr: impressions ? (clicks * 100) / impressions : null,
  link_ctr: impressions ? (clicks * 58) / impressions : null,
  cpc: clicks ? spend / clicks : null,
  link_cpc: clicks ? spend / (clicks * 0.58) : null,
  cpm: impressions ? (spend * 1000) / impressions : null,
  cost_per_result: results ? spend / results : null,
});

const days = ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"];
const googleDaily = [
  [104.2, 702, 43, 5], [119.45, 764, 48, 7], [135.17, 845, 54, 8], [117.23, 781, 47, 6],
  [126.8, 868, 50, 7], [131.12, 895, 51, 6], [134.18, 920, 47, 8],
];
const metaDaily = [
  [178.15, 8720, 111, 10, 7910], [185.44, 9014, 116, 12, 8240], [199.32, 9480, 120, 14, 8701],
  [176.6, 8672, 109, 11, 8032], [205.71, 9915, 128, 15, 9093], [196.9, 9560, 122, 13, 8875], [207.39, 10240, 135, 15, 9998],
];
const analyticsDaily: AnalyticsDailyMetric[] = [
  { date: days[0], sessions: 381, engaged_sessions: 249, active_users: 334, new_users: 278, views: 612, events: 1840, conversions: 12, revenue: 0, page_views: 612, scrolls: 214, generate_leads: 12 },
  { date: days[1], sessions: 407, engaged_sessions: 276, active_users: 356, new_users: 291, views: 674, events: 2016, conversions: 15, revenue: 0, page_views: 674, scrolls: 238, generate_leads: 15 },
  { date: days[2], sessions: 429, engaged_sessions: 301, active_users: 378, new_users: 312, views: 718, events: 2174, conversions: 18, revenue: 0, page_views: 718, scrolls: 267, generate_leads: 18 },
  { date: days[3], sessions: 394, engaged_sessions: 258, active_users: 342, new_users: 284, views: 638, events: 1905, conversions: 13, revenue: 0, page_views: 638, scrolls: 221, generate_leads: 13 },
  { date: days[4], sessions: 452, engaged_sessions: 319, active_users: 401, new_users: 326, views: 764, events: 2298, conversions: 19, revenue: 0, page_views: 764, scrolls: 291, generate_leads: 19 },
  { date: days[5], sessions: 438, engaged_sessions: 297, active_users: 386, new_users: 315, views: 735, events: 2207, conversions: 17, revenue: 0, page_views: 735, scrolls: 273, generate_leads: 17 },
  { date: days[6], sessions: 469, engaged_sessions: 327, active_users: 414, new_users: 339, views: 802, events: 2416, conversions: 21, revenue: 0, page_views: 802, scrolls: 304, generate_leads: 21 },
];

const analyticsKpis = (daily: AnalyticsDailyMetric[]): AnalyticsKpis => daily.reduce<AnalyticsKpis>((total, item) => ({
  has_data: true,
  sessions: total.sessions + item.sessions,
  engaged_sessions: total.engaged_sessions + item.engaged_sessions,
  active_users: total.active_users + item.active_users,
  new_users: total.new_users + item.new_users,
  views: total.views + item.views,
  events: total.events + item.events,
  conversions: total.conversions + item.conversions,
  revenue: total.revenue + item.revenue,
  generate_leads: total.generate_leads + item.generate_leads,
}), { has_data: false, sessions: 0, engaged_sessions: 0, active_users: 0, new_users: 0, views: 0, events: 0, conversions: 0, revenue: 0, generate_leads: 0 });

export const mockOverview: OverviewResponse = {
  client: { id: 1, slug: "maria-gasolina", name: "Maria Gasolina Express", timezone: "America/Sao_Paulo" },
  period: { start: days[0], end: days[6], days: 7 },
  comparison_period: { start: "2026-08-26", end: "2026-09-01", days: 7 },
  available_range: { start: "2026-09-02", end: "2026-09-08" },
  last_sync: {
    google_ads: { status: "success", completed_at: "2026-09-09T11:04:00Z", range_start: days[0], range_end: days[6] },
    meta_ads: { status: "success", completed_at: "2026-09-09T11:07:00Z", range_start: days[0], range_end: days[6] },
    ga4: { status: "success", completed_at: "2026-09-09T11:10:00Z", range_start: days[0], range_end: days[6] },
  },
  current: {
    consolidated: kpis(2217.66, 71376, 1181, 137),
    sources: {
      google_ads: kpis(868.15, 5775, 340, 47),
      meta_ads: kpis(1349.51, 65601, 841, 90, 60849),
    },
  },
  previous: {
    consolidated: kpis(2048.82, 68110, 1093, 121),
    sources: {
      google_ads: kpis(824.32, 5530, 321, 41),
      meta_ads: kpis(1224.5, 62580, 772, 80, 57940),
    },
  },
  daily: days.flatMap((date, index) => {
    const g = googleDaily[index];
    const m = metaDaily[index];
    return [
      { date, source: "google_ads" as const, spend: g[0], impressions: g[1], reach: 0, clicks: g[2], link_clicks: 0, results: g[3] },
      { date, source: "meta_ads" as const, spend: m[0], impressions: m[1], reach: m[4], clicks: m[2], link_clicks: Math.round(m[2] * 0.58), results: m[3] },
    ];
  }),
  analytics: {
    current: analyticsKpis(analyticsDaily),
    previous: {
      has_data: true,
      sessions: 2764,
      engaged_sessions: 1812,
      active_users: 2421,
      new_users: 1998,
      views: 4598,
      events: 13842,
      conversions: 104,
      revenue: 0,
      generate_leads: 104,
    },
    daily: analyticsDaily,
  },
};

const acquisitionBase: Array<Omit<AnalyticsAcquisitionItem, "engagement_rate" | "lead_rate">> = [
  { channel_group: "Organic Search", source_medium: "google / organic", sessions: 942, engaged_sessions: 704, new_users: 681, views: 1628, events: 4920, key_events: 31, generate_leads: 31 },
  { channel_group: "Paid Search", source_medium: "google / cpc", sessions: 721, engaged_sessions: 514, new_users: 498, views: 1197, events: 3614, key_events: 28, generate_leads: 28 },
  { channel_group: "Direct", source_medium: "(direct) / (none)", sessions: 584, engaged_sessions: 363, new_users: 421, views: 876, events: 2442, key_events: 17, generate_leads: 17 },
  { channel_group: "Paid Social", source_medium: "facebook / paid", sessions: 331, engaged_sessions: 214, new_users: 278, views: 512, events: 1491, key_events: 12, generate_leads: 12 },
  { channel_group: "Organic Social", source_medium: "instagram.com / referral", sessions: 186, engaged_sessions: 119, new_users: 142, views: 297, events: 831, key_events: 6, generate_leads: 6 },
  { channel_group: "Referral", source_medium: "franquiasdobrasil.com.br / referral", sessions: 142, engaged_sessions: 98, new_users: 104, views: 244, events: 696, key_events: 5, generate_leads: 5 },
  { channel_group: "Email", source_medium: "newsletter / email", sessions: 91, engaged_sessions: 67, new_users: 38, views: 158, events: 438, key_events: 3, generate_leads: 3 },
  { channel_group: "Display", source_medium: "google / display", sessions: 76, engaged_sessions: 42, new_users: 59, views: 109, events: 301, key_events: 2, generate_leads: 2 },
  { channel_group: "Unassigned", source_medium: "(not set)", sessions: 63, engaged_sessions: 29, new_users: 47, views: 88, events: 223, key_events: 1, generate_leads: 1 },
  { channel_group: "Organic Video", source_medium: "youtube.com / referral", sessions: 48, engaged_sessions: 31, new_users: 36, views: 82, events: 201, key_events: 1, generate_leads: 1 },
  { channel_group: "Cross-network", source_medium: "google / cross-network", sessions: 37, engaged_sessions: 24, new_users: 29, views: 64, events: 171, key_events: 1, generate_leads: 1 },
  { channel_group: "SMS", source_medium: "crm / sms", sessions: 19, engaged_sessions: 11, new_users: 7, views: 31, events: 78, key_events: 0, generate_leads: 0 },
];

export const mockAnalyticsAcquisition: AnalyticsAcquisitionItem[] = acquisitionBase.map((item) => ({
  ...item,
  engagement_rate: item.sessions ? item.engaged_sessions * 100 / item.sessions : null,
  lead_rate: item.sessions ? item.generate_leads * 100 / item.sessions : null,
}));

const eventSeed: Array<[string, number, number]> = [
  ["page_view", 5003, 0], ["scroll", 1808, 0], ["session_start", 3008, 0], ["user_engagement", 2763, 0],
  ["first_visit", 2358, 0], ["form_submit", 127, 127], ["click", 892, 0], ["form_start", 318, 0],
  ["view_search_results", 204, 0], ["file_download", 96, 0], ["video_start", 71, 0], ["(not set)", 18, 0],
];
const eventTotal = eventSeed.reduce((sum, [, count]) => sum + count, 0);
export const mockAnalyticsEvents: AnalyticsEventItem[] = eventSeed.map(([event_name, event_count, key_events]) => ({
  event_name, event_count, key_events, daily_average: event_count / 7, share_of_total: event_count * 100 / eventTotal,
}));

const entity = (
  source: "google_ads" | "meta_ads",
  level: "campaign" | "group" | "ad" | "keyword",
  id: string,
  name: string,
  spend: number,
  impressions: number,
  clicks: number,
  results: number,
  parentName: string | null = null,
): EntityItem => ({
  ...kpis(spend, impressions, clicks, results, Math.round(impressions * 0.88)),
  source,
  level,
  item_id: id,
  item_name: name,
  item_status: "ENABLED",
  parent_id: parentName ? `parent-${id}` : null,
  parent_name: parentName,
});

export const mockEntities: Record<string, CursorPage<EntityItem>> = {
  google_campaign: {
    total_count: 4,
    next_cursor: null,
    items: [
      entity("google_ads", "campaign", "g1", "MG | SEARCH | MAX.CONV | CONDOMÍNIOS", 347.08, 1430, 66, 7),
      entity("google_ads", "campaign", "g2", "MG | SEARCH | MAX.CONV | FRANQUIA", 296.89, 1790, 111, 6),
      entity("google_ads", "campaign", "g3", "MG | SEARCH | MAX.CLIQUES | INDICAÇÃO", 117.22, 890, 26, 3),
      entity("google_ads", "campaign", "g4", "MG | PERFORMANCE MAX | EXPRESS", 106.96, 1665, 137, 31),
    ],
  },
  google_group: {
    total_count: 6,
    next_cursor: null,
    items: [
      entity("google_ads", "group", "gg1", "Marca + Maria Gasolina", 198.22, 910, 41, 5, "MG | SEARCH | CONDOMÍNIOS"),
      entity("google_ads", "group", "gg2", "Franquia de conveniência", 174.5, 1050, 59, 4, "MG | SEARCH | FRANQUIA"),
      entity("google_ads", "group", "gg3", "Mercado autônomo", 151.32, 978, 48, 6, "MG | SEARCH | FRANQUIA"),
      entity("google_ads", "group", "gg4", "Indicação de síndicos", 117.22, 890, 26, 3, "MG | SEARCH | INDICAÇÃO"),
      entity("google_ads", "group", "gg5", "Condomínios", 112.18, 840, 37, 4, "MG | SEARCH | CONDOMÍNIOS"),
      entity("google_ads", "group", "gg6", "Express | Geral", 106.96, 1665, 137, 31, "MG | PERFORMANCE MAX | EXPRESS"),
    ],
  },
  google_keyword: {
    total_count: 12,
    next_cursor: null,
    items: [
      entity("google_ads", "keyword", "kw1", "[maria gasolina]", 98.42, 812, 55, 7, "Marca + Maria Gasolina"),
      entity("google_ads", "keyword", "kw2", "[mercado em condomínio]", 87.31, 760, 44, 5, "Condomínios"),
      entity("google_ads", "keyword", "kw3", "\"franquia de mercado\"", 76.18, 642, 38, 4, "Franquia de conveniência"),
      entity("google_ads", "keyword", "kw4", "[mercado 24 horas]", 63.8, 526, 31, 4, "Express | Geral"),
      entity("google_ads", "keyword", "kw5", "\"minimercado autônomo\"", 54.92, 418, 25, 3, "Mercado autônomo"),
      entity("google_ads", "keyword", "kw6", "[loja de conveniência condomínio]", 48.77, 392, 22, 3, "Condomínios"),
      entity("google_ads", "keyword", "kw7", "\"franquia de conveniência\"", 43.66, 344, 19, 2, "Franquia de conveniência"),
      entity("google_ads", "keyword", "kw8", "[maria gasolina express]", 38.42, 315, 18, 2, "Marca + Maria Gasolina"),
      entity("google_ads", "keyword", "kw9", "\"mercado no condomínio\"", 34.18, 278, 16, 2, "Condomínios"),
      entity("google_ads", "keyword", "kw10", "[mini mercado condomínio]", 29.65, 242, 13, 1, "Condomínios"),
      entity("google_ads", "keyword", "kw11", "\"mercado autônomo\"", 24.31, 198, 11, 1, "Mercado autônomo"),
      entity("google_ads", "keyword", "kw12", "[franquia maria gasolina]", 18.67, 151, 8, 1, "Franquia de conveniência"),
    ],
  },
  meta_campaign: {
    total_count: 5,
    next_cursor: null,
    items: [
      entity("meta_ads", "campaign", "m1", "MG | LEADS | CBO | CONDOMÍNIOS", 346.93, 17042, 165, 30),
      entity("meta_ads", "campaign", "m2", "MG | LEADS | CBO | FRANQUIA | POSTS", 332.64, 15230, 149, 13),
      entity("meta_ads", "campaign", "m3", "MG | LEADS | CBO | FRANQUIA | FORMULÁRIO", 287.26, 14112, 179, 32),
      entity("meta_ads", "campaign", "m4", "MG | LEADS | CBO | NOVOS CRIATIVOS", 272.57, 12480, 237, 15),
      entity("meta_ads", "campaign", "m5", "MG | RECONHECIMENTO | REMARKETING", 110.11, 6737, 111, 0),
    ],
  },
  meta_group: {
    total_count: 5,
    next_cursor: null,
    items: [
      entity("meta_ads", "group", "mg1", "Síndicos | Sudeste | 30-60", 312.2, 15840, 152, 28, "MG | LEADS | CONDOMÍNIOS"),
      entity("meta_ads", "group", "mg2", "Franqueados | Lookalike 2%", 294.5, 14320, 163, 24, "MG | LEADS | FRANQUIA"),
      entity("meta_ads", "group", "mg3", "Empreendedores | Interesses", 281.04, 13910, 174, 21, "MG | LEADS | FRANQUIA"),
      entity("meta_ads", "group", "mg4", "Condomínios | Capitais", 252.67, 12261, 139, 17, "MG | LEADS | CONDOMÍNIOS"),
      entity("meta_ads", "group", "mg5", "Visitantes do site | 30 dias", 209.1, 9270, 213, 0, "MG | REMARKETING"),
    ],
  },
  meta_ad: {
    total_count: 12,
    next_cursor: null,
    items: [
      entity("meta_ads", "ad", "ma1", "Vídeo | Mercado no condomínio", 229.42, 11030, 143, 23, "Síndicos | Sudeste"),
      entity("meta_ads", "ad", "ma2", "Carrossel | Conveniência 24h", 216.08, 10421, 132, 18, "Condomínios | Capitais"),
      entity("meta_ads", "ad", "ma3", "Estático | Seja um franqueado", 207.37, 9810, 129, 15, "Franqueados | Lookalike 2%"),
      entity("meta_ads", "ad", "ma4", "Reels | Renda recorrente", 198.92, 9450, 128, 14, "Empreendedores | Interesses"),
      entity("meta_ads", "ad", "ma5", "Depoimento | Síndico parceiro", 184.31, 8870, 120, 12, "Síndicos | Sudeste"),
      entity("meta_ads", "ad", "ma6", "Imagem | Sua loja completa", 176.72, 8020, 111, 8, "Visitantes do site | 30 dias"),
      entity("meta_ads", "ad", "ma7", "Vídeo | Rotina sem filas", 154.37, 7160, 96, 7, "Condomínios | Capitais"),
      entity("meta_ads", "ad", "ma8", "Carrossel | Produtos essenciais", 143.21, 6640, 88, 6, "Síndicos | Sudeste"),
      entity("meta_ads", "ad", "ma9", "Reels | Empreender perto", 131.9, 6130, 81, 5, "Franqueados | Lookalike 2%"),
      entity("meta_ads", "ad", "ma10", "Estático | Seu condomínio completo", 118.78, 5620, 74, 4, "Condomínios | Capitais"),
      entity("meta_ads", "ad", "ma11", "Depoimento | Mais praticidade", 104.5, 5110, 67, 3, "Empreendedores | Interesses"),
      entity("meta_ads", "ad", "ma12", "Imagem | Conheça a franquia", 92.14, 4680, 60, 2, "Franqueados | Lookalike 2%"),
    ],
  },
};

const pmaxAsset = (
  id: string,
  name: string,
  type: string,
  label: string,
  results: number,
  content: string | null = null,
): PmaxItem => ({
  ...kpis(0, 0, 0, results),
  level: "asset",
  item_id: id,
  item_name: name,
  item_status: "ENABLED",
  campaign_id: "g4",
  campaign_name: "MG | PERFORMANCE MAX | EXPRESS",
  asset_group_id: "pag1",
  asset_group_name: "Maria Gasolina Express | Geral",
  field_type: type,
  performance_label: label,
  text_content: content,
  image_url: null,
  youtube_video_id: type === "YOUTUBE_VIDEO" ? "dQw4w9WgXcQ" : null,
  ad_strength: null,
});

export const mockPmax: Record<string, CursorPage<PmaxItem>> = {
  asset_group: {
    total_count: 1,
    next_cursor: null,
    items: [{
      ...kpis(106.96, 1665, 137, 31),
      level: "asset_group",
      item_id: "pag1",
      item_name: "Maria Gasolina Express | Geral",
      item_status: "ENABLED",
      campaign_id: "g4",
      campaign_name: "MG | PERFORMANCE MAX | EXPRESS",
      asset_group_id: null,
      asset_group_name: null,
      field_type: null,
      performance_label: null,
      text_content: null,
      image_url: null,
      youtube_video_id: null,
      ad_strength: "GOOD",
    }],
  },
  asset: {
    total_count: 6,
    next_cursor: null,
    items: [
      pmaxAsset("pa1", "Conveniência que mora com você", "HEADLINE", "BEST", 12, "Conveniência que mora com você"),
      pmaxAsset("pa2", "Mercado completo, sempre aberto", "HEADLINE", "GOOD", 8, "Mercado completo, sempre aberto"),
      pmaxAsset("pa3", "Maria Gasolina Express", "LONG_HEADLINE", "BEST", 5, "Tudo o que seu condomínio precisa, perto e disponível 24 horas"),
      pmaxAsset("pa4", "Descrição institucional", "DESCRIPTION", "GOOD", 3, "Praticidade, segurança e variedade para o seu dia a dia."),
      pmaxAsset("pa5", "Vídeo institucional", "YOUTUBE_VIDEO", "LEARNING", 2),
      pmaxAsset("pa6", "Imagem quadrada da marca", "SQUARE_MARKETING_IMAGE", "GOOD", 1),
    ],
  },
};

