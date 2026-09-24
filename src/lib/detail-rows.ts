import type { CampaignRow, Channel, EntityItem, EntityLevel, Front, PmaxItem, PmaxLevel } from "../types";
import { classifyFront } from "./api";

// Normalização do detalhamento: campanhas, grupos/conjuntos, anúncios e
// palavras-chave vivem num bloco só, governado pelo filtro de canal do topo da
// página. Performance Max não tem abas próprias — os grupos de recursos entram
// em "Grupos de anúncios" e os recursos em "Anúncios", marcados com o selo PMAX.
//
// A frente de qualquer entidade vem da campanha ancestral, nunca do próprio
// nome: uma palavra-chave "[mercado 24h]" pertence a Franquias se a campanha
// dela contém FRANQ, mesmo que o texto não diga nada.
//
// Nada aqui alimenta os KPIs do topo: métricas de recurso PMax se repetem por
// associação no backend, então somá-las produziria dupla contagem. Este módulo
// só ordena e rotula linhas de detalhamento.

export type ChannelFilter = "all" | "meta_ads" | "google_ads";
export type DetailLevel = "campaign" | "group" | "ad" | "keyword";

export interface DetailRow {
  key: string;
  level: DetailLevel;
  item_id: string;
  item_name: string;
  subtitle: string | null;
  channel: Channel;
  pmax: boolean;
  parent_id: string | null;
  /** Nome da campanha ancestral — a única fonte da frente. Null até ser resolvido. */
  campaign_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  ctr: number | null;
  cost_per_result: number | null;
  field_type: string | null;
  performance_label: string | null;
  image_url: string | null;
  youtube_video_id: string | null;
  text_content: string | null;
}

export interface LevelOption {
  id: DetailLevel;
  label: string;
  emptyLabel: string;
}

/**
 * Abas por canal. "Palavras-chave" não existe no Meta. O nível intermediário
 * muda de nome entre as plataformas e usa o rótulo neutro na visão combinada.
 * Recursos PMax aparecem em "Anúncios" — o nome da aba não muda por causa deles.
 */
export function levelsFor(filter: ChannelFilter): LevelOption[] {
  const meta = filter === "meta_ads";
  const levels: LevelOption[] = [
    { id: "campaign", label: "Campanhas", emptyLabel: "Nenhuma campanha com dados neste período." },
    meta
      ? { id: "group", label: "Conjuntos de anúncios", emptyLabel: "Nenhum conjunto de anúncios com dados neste período." }
      : { id: "group", label: "Grupos de anúncios", emptyLabel: "Nenhum grupo de anúncios com dados neste período." },
    { id: "ad", label: "Anúncios", emptyLabel: "Nenhum anúncio com dados neste período." },
  ];
  if (!meta) levels.push({ id: "keyword", label: "Palavras-chave", emptyLabel: "Nenhuma palavra-chave com dados neste período." });
  return levels;
}

/** Mantém o nível escolhido só enquanto ele existir no canal selecionado. */
export function resolveLevel(level: DetailLevel, filter: ChannelFilter): DetailLevel {
  return levelsFor(filter).some((option) => option.id === level) ? level : "campaign";
}

export interface LevelPlan {
  /** Canais cujas entidades tradicionais entram na lista. */
  entitySources: Channel[];
  /** Nível PMax que entra na mesma lista, se algum. */
  pmax: PmaxLevel | null;
}

/**
 * Matriz definitiva de fontes. Anúncios tradicionais do Google ficam de fora da
 * aba Anúncios por decisão de produto: no Google ela mostra só recursos PMax.
 */
export function planFor(level: Exclude<DetailLevel, "campaign">, filter: ChannelFilter): LevelPlan {
  const withMeta = filter !== "google_ads";
  const withGoogle = filter !== "meta_ads";
  if (level === "group") {
    return {
      entitySources: [...(withMeta ? ["meta_ads" as const] : []), ...(withGoogle ? ["google_ads" as const] : [])],
      pmax: withGoogle ? "asset_group" : null,
    };
  }
  if (level === "ad") {
    return { entitySources: withMeta ? ["meta_ads"] : [], pmax: withGoogle ? "asset" : null };
  }
  return { entitySources: withGoogle ? ["google_ads"] : [], pmax: null };
}

/**
 * Leituras auxiliares para herdar a frente. Grupos já trazem o nome da campanha;
 * anúncios e palavras-chave só trazem o id do pai, então é preciso subir a
 * árvore: palavra-chave → grupo → campanha; anúncio → conjunto → campanha.
 */
export function lookupsFor(level: Exclude<DetailLevel, "campaign">, plan: LevelPlan): Array<{ source: Channel; level: EntityLevel }> {
  if (level === "keyword") return plan.entitySources.map((source) => ({ source, level: "group" }));
  if (level === "ad") {
    return plan.entitySources.flatMap((source) => [{ source, level: "group" as const }, { source, level: "campaign" as const }]);
  }
  return [];
}

const PMAX_CAMPAIGN = /performance ?max|pmax/i;

export function formatKeywordName(text: string, matchType?: string | null): string {
  if (matchType === "PHRASE") return `"${text}"`;
  if (matchType === "EXACT") return `[${text}]`;
  return text;
}

export function entityToRow(item: EntityItem): DetailRow {
  return {
    // Palavra-chave do Google só é única dentro do grupo; o pai entra na chave.
    key: `${item.source}:${item.level}:${item.parent_id ?? ""}:${item.item_id}`,
    level: item.level,
    item_id: item.item_id,
    item_name: item.level === "keyword" ? formatKeywordName(item.item_name, item.keyword_match_type) : item.item_name,
    subtitle: item.parent_name ?? item.item_status,
    channel: item.source,
    pmax: false,
    parent_id: item.parent_id,
    // No nível de grupo o pai é a campanha; nos demais é resolvido depois.
    campaign_name: item.level === "group" ? item.parent_name : item.level === "campaign" ? item.item_name : null,
    spend: item.spend,
    impressions: item.impressions,
    clicks: item.clicks,
    results: item.results,
    ctr: item.ctr,
    cost_per_result: item.cost_per_result,
    field_type: null,
    performance_label: null,
    image_url: null,
    youtube_video_id: null,
    text_content: null,
  };
}

export function pmaxToRow(item: PmaxItem): DetailRow {
  return {
    // O mesmo recurso aparece em vários grupos e com mais de um tipo de campo.
    key: `google_ads:pmax:${item.level}:${item.campaign_id}:${item.asset_group_id ?? ""}:${item.item_id}:${item.field_type ?? ""}`,
    level: item.level === "asset_group" ? "group" : "ad",
    item_id: item.item_id,
    item_name: item.item_name,
    subtitle: item.asset_group_name ?? item.campaign_name,
    channel: "google_ads",
    pmax: true,
    parent_id: item.asset_group_id ?? item.campaign_id,
    campaign_name: item.campaign_name,
    spend: item.spend,
    impressions: item.impressions,
    clicks: item.clicks,
    results: item.results,
    ctr: item.ctr,
    cost_per_result: item.cost_per_result,
    field_type: item.field_type,
    performance_label: item.performance_label ?? item.ad_strength,
    image_url: item.image_url,
    youtube_video_id: item.youtube_video_id,
    text_content: item.text_content,
  };
}

export function campaignToRow(campaign: CampaignRow): DetailRow {
  return {
    key: `${campaign.channel}:campaign::${campaign.id}`,
    level: "campaign",
    item_id: campaign.id,
    item_name: campaign.name,
    subtitle: campaign.objective,
    channel: campaign.channel,
    pmax: PMAX_CAMPAIGN.test(campaign.name),
    parent_id: null,
    campaign_name: campaign.name,
    spend: campaign.spend,
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    results: campaign.leads,
    ctr: campaign.ctr,
    cost_per_result: campaign.cpl,
    field_type: null,
    performance_label: null,
    image_url: null,
    youtube_video_id: null,
    text_content: null,
  };
}

export interface Ancestry {
  /** `${canal}:${id do grupo ou conjunto}` → nome da campanha. */
  groupCampaign: Map<string, string>;
  /** `${canal}:${id da campanha}` → nome da campanha. */
  campaignName: Map<string, string>;
}

export function buildAncestry(groups: EntityItem[] = [], campaigns: EntityItem[] = []): Ancestry {
  const groupCampaign = new Map<string, string>();
  groups.forEach((g) => { if (g.parent_name) groupCampaign.set(`${g.source}:${g.item_id}`, g.parent_name); });
  const campaignName = new Map<string, string>();
  campaigns.forEach((c) => campaignName.set(`${c.source}:${c.item_id}`, c.item_name));
  return { groupCampaign, campaignName };
}

/**
 * Preenche a campanha ancestral de anúncios e palavras-chave pelo id do pai.
 * O pai do anúncio é o conjunto — ou a própria campanha quando ele não existe,
 * como a RPC indica ao cair em campaign_id.
 */
export function withAncestry(row: DetailRow, ancestry: Ancestry): DetailRow {
  if (row.campaign_name || !row.parent_id) return row;
  const key = `${row.channel}:${row.parent_id}`;
  const campaign = ancestry.groupCampaign.get(key) ?? (row.level === "ad" ? ancestry.campaignName.get(key) : undefined);
  return campaign ? { ...row, campaign_name: campaign } : row;
}

/** A frente vem só da campanha ancestral — nunca do nome da própria entidade. */
export function frontOf(row: DetailRow): Front | null {
  return classifyFront(row.campaign_name);
}

/**
 * Junta as entidades tradicionais com os itens PMax do mesmo nível e resolve a
 * campanha de cada linha. É concatenação, nunca soma — métricas de recurso PMax
 * se repetem por associação e não podem virar total de nada.
 */
export function buildDetailRows(entityPages: EntityItem[][], pmaxItems: PmaxItem[] = [], ancestry?: Ancestry): DetailRow[] {
  const rows = [...entityPages.flat().map(entityToRow), ...pmaxItems.map(pmaxToRow)];
  return ancestry ? rows.map((row) => withAncestry(row, ancestry)) : rows;
}

export interface FrontSlice {
  items: DetailRow[];
  /** Linhas cuja campanha não é FRANQ nem COND, ou não pôde ser resolvida. */
  outside: number;
}

export function sliceByFront(rows: DetailRow[], front: Front): FrontSlice {
  const items = rows.filter((row) => frontOf(row) === front);
  const outside = rows.filter((row) => frontOf(row) === null).length;
  return { items, outside };
}
