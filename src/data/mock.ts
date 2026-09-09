import type { CursorPage, EntityItem, OverviewResponse, PmaxItem } from "../types";

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

export const mockOverview: OverviewResponse = {
  client: { id: 1, slug: "maria-gasolina", name: "Maria Gasolina Express", timezone: "America/Sao_Paulo" },
  period: { start: days[0], end: days[6], days: 7 },
  comparison_period: { start: "2026-08-26", end: "2026-09-01", days: 7 },
  available_range: { start: "2026-09-02", end: "2026-09-08" },
  last_sync: {
    google_ads: { status: "success", completed_at: "2026-09-09T11:04:00Z", range_start: days[0], range_end: days[6] },
    meta_ads: { status: "success", completed_at: "2026-09-09T11:07:00Z", range_start: days[0], range_end: days[6] },
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
};

const entity = (
  source: "google_ads" | "meta_ads",
  level: "campaign" | "group" | "ad",
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
      entity("google_ads", "campaign", "g1", "MG | SEARCH | MAX.CONV | INSTITUCIONAL", 347.08, 1430, 66, 7),
      entity("google_ads", "campaign", "g2", "MG | SEARCH | MAX.CONV | FRANQUIADOS", 296.89, 1790, 111, 6),
      entity("google_ads", "campaign", "g3", "MG | SEARCH | MAX.CLIQUES | INDICAÇÃO", 117.22, 890, 26, 3),
      entity("google_ads", "campaign", "g4", "MG | PERFORMANCE MAX | EXPRESS", 106.96, 1665, 137, 31),
    ],
  },
  google_group: {
    total_count: 6,
    next_cursor: null,
    items: [
      entity("google_ads", "group", "gg1", "Marca + Maria Gasolina", 198.22, 910, 41, 5, "MG | SEARCH | INSTITUCIONAL"),
      entity("google_ads", "group", "gg2", "Franquia de conveniência", 174.5, 1050, 59, 4, "MG | SEARCH | FRANQUIADOS"),
      entity("google_ads", "group", "gg3", "Mercado autônomo", 151.32, 978, 48, 6, "MG | SEARCH | FRANQUIADOS"),
      entity("google_ads", "group", "gg4", "Indicação de síndicos", 117.22, 890, 26, 3, "MG | SEARCH | INDICAÇÃO"),
      entity("google_ads", "group", "gg5", "Condomínios", 112.18, 840, 37, 4, "MG | SEARCH | INSTITUCIONAL"),
      entity("google_ads", "group", "gg6", "Express | Geral", 106.96, 1665, 137, 31, "MG | PERFORMANCE MAX | EXPRESS"),
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
    total_count: 6,
    next_cursor: null,
    items: [
      entity("meta_ads", "ad", "ma1", "Vídeo | Mercado no condomínio", 229.42, 11030, 143, 23, "Síndicos | Sudeste"),
      entity("meta_ads", "ad", "ma2", "Carrossel | Conveniência 24h", 216.08, 10421, 132, 18, "Condomínios | Capitais"),
      entity("meta_ads", "ad", "ma3", "Estático | Seja um franqueado", 207.37, 9810, 129, 15, "Franqueados | Lookalike 2%"),
      entity("meta_ads", "ad", "ma4", "Reels | Renda recorrente", 198.92, 9450, 128, 14, "Empreendedores | Interesses"),
      entity("meta_ads", "ad", "ma5", "Depoimento | Síndico parceiro", 184.31, 8870, 120, 12, "Síndicos | Sudeste"),
      entity("meta_ads", "ad", "ma6", "Imagem | Sua loja completa", 176.72, 8020, 111, 8, "Visitantes do site | 30 dias"),
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
