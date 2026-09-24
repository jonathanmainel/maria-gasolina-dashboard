import type { CampaignRow, Channel, EntityItem, Front, PmaxItem } from "../types";
import { classifyFront } from "./api";

// Normalização do detalhamento: campanhas, grupos/conjuntos, anúncios e
// palavras-chave passam a viver num bloco só, governado pelo filtro de canal do
// topo da página. Performance Max deixa de ter abas próprias — os grupos de
// recursos entram em "Grupos de anúncios" e os recursos em "Anúncios", marcados
// com o selo PMAX para não serem confundidos com as entidades tradicionais.
//
// Nada aqui alimenta os KPIs do topo: métricas de recurso PMax se repetem por
// associação no backend, então somá-las produziria dupla contagem. Este módulo
// só ordena e rotula linhas de detalhamento.

export type ChannelFilter = "all" | "meta_ads" | "google_ads";
export type DetailLevel = "campaign" | "group" | "ad" | "keyword";

export interface DetailRow {
  key: string;
  item_id: string;
  item_name: string;
  subtitle: string | null;
  channel: Channel;
  pmax: boolean;
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
 * Níveis disponíveis para cada canal. "Palavras-chave" só existe no Google; o
 * nível intermediário muda de nome entre as plataformas e usa o rótulo neutro
 * na visão combinada.
 */
export function levelsFor(filter: ChannelFilter): LevelOption[] {
  const groupLabel = filter === "meta_ads" ? "Conjuntos de anúncios" : "Grupos de anúncios";
  const levels: LevelOption[] = [
    { id: "campaign", label: "Campanhas", emptyLabel: "Nenhuma campanha com dados neste período." },
    { id: "group", label: groupLabel, emptyLabel: `Nenhum ${groupLabel.toLowerCase().replace(/s$/, "")} com dados neste período.` },
    { id: "ad", label: "Anúncios", emptyLabel: "Nenhum anúncio com dados neste período." },
  ];
  if (filter === "google_ads") {
    levels.push({ id: "keyword", label: "Palavras-chave", emptyLabel: "Nenhuma palavra-chave com dados neste período." });
  }
  return levels;
}

/** Mantém o nível escolhido só enquanto ele existir no canal selecionado. */
export function resolveLevel(level: DetailLevel, filter: ChannelFilter): DetailLevel {
  return levelsFor(filter).some((option) => option.id === level) ? level : "campaign";
}

/** Canais que precisam ser consultados para montar um nível. */
export function sourcesFor(filter: ChannelFilter): Channel[] {
  if (filter === "all") return ["meta_ads", "google_ads"];
  return [filter];
}

/** Performance Max só aparece no Google e apenas nos níveis de grupo e anúncio. */
export function includesPmax(level: DetailLevel, filter: ChannelFilter): boolean {
  return (level === "group" || level === "ad") && filter !== "meta_ads";
}

const PMAX_CAMPAIGN = /performance ?max|pmax/i;

export function entityToRow(item: EntityItem): DetailRow {
  return {
    key: `${item.source}:entity:${item.item_id}`,
    item_id: item.item_id,
    item_name: item.item_name,
    subtitle: item.parent_name ?? item.item_status,
    channel: item.source,
    pmax: false,
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
    key: `google_ads:pmax:${item.item_id}`,
    item_id: item.item_id,
    item_name: item.item_name,
    subtitle: item.asset_group_name ?? item.campaign_name,
    channel: "google_ads",
    pmax: true,
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
    key: `${campaign.channel}:campaign:${campaign.id}`,
    item_id: campaign.id,
    item_name: campaign.name,
    subtitle: campaign.objective,
    channel: campaign.channel,
    pmax: PMAX_CAMPAIGN.test(campaign.name),
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

/**
 * Atribui a frente pelo nome da entidade ou do pai — as RPCs de leitura não
 * conhecem o conceito de frente, então vale o mesmo padrão das campanhas.
 */
export function matchesFront(row: DetailRow, front: Front): boolean {
  return [row.item_name, row.subtitle].some((name) => classifyFront(name) === front);
}

/**
 * Junta as entidades tradicionais de cada canal com os itens de Performance
 * Max do mesmo nível. É concatenação, nunca soma: métricas de recurso PMax se
 * repetem por associação no backend e não podem virar total de nada.
 */
export function buildDetailRows(entityPages: EntityItem[][], pmaxItems: PmaxItem[] = []): DetailRow[] {
  return [...entityPages.flat().map(entityToRow), ...pmaxItems.map(pmaxToRow)];
}
