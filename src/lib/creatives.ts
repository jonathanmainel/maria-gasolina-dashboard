import type { Creative, Front } from "../types";

// ---------------------------------------------------------------------------
// Ranking de criativos ("Criativos que mais geram leads").
//
// A seção existe para analisar PEÇAS VISUAIS — imagem, vídeo, carrossel e
// dinâmico — então só entra Meta Ads. Search não tem peça para mostrar (viraria
// um card em degradê com o nome da campanha) e os recursos de PMax já têm lugar
// próprio no detalhamento. Google Ads segue inteiro no resto do dashboard:
// KPIs, gráficos, campanhas, grupos, anúncios, assets PMax e palavras-chave.
//
// A ordem importa: filtra canal e frente ANTES de ordenar e recortar. Ordenar
// Meta junto com Google e só depois remover o Google deixaria buracos no
// ranking e gastaria as vagas do Top 9 com peças que nunca são exibidas — era
// exatamente assim que os previews vinham sendo buscados.
// ---------------------------------------------------------------------------

/** Cards visíveis antes de "Ver mais criativos". */
export const CREATIVE_RANKING_PREVIEW = 3;

/** Teto de cards e previews por categoria de cada frente. */
export const CREATIVE_RANKING_LIMIT = 9;

export const CREATIVE_CATEGORIES = ["video", "static"] as const;
export type CreativeCategory = typeof CREATIVE_CATEGORIES[number];

/** A JPEG thumbnail does not turn a video ad into a static ad. */
export function creativeCategory(creative: Creative): CreativeCategory {
  if (creative.creative_type === "video") return "video";
  if (creative.preview_media_type) return creative.preview_media_type === "video" ? "video" : "static";
  if (creative.creative_type === "image" || creative.creative_type === "carousel") return "static";
  return creative.format === "video" ? "video" : "static";
}

/**
 * Criativos de uma frente/categoria, só de Meta Ads, do maior para o menor número de
 * leads. O desempate por id mantém a ordem estável entre renders quando duas
 * peças empatam em leads.
 */
export function rankCreatives(creatives: Creative[], front: Front, category?: CreativeCategory): Creative[] {
  return creatives
    .filter((creative) => creative.front === front && creative.channel === "meta_ads")
    .filter((creative) => !category || creativeCategory(creative) === category)
    .sort((a, b) => b.leads - a.leads || a.id.localeCompare(b.id));
}

/**
 * Ids que a seção pode exibir em cada frente, que são exatamente os que
 * precisam de preview. Fonte única para a tela e para o enriquecimento na
 * leitura, para os dois limites não voltarem a divergir.
 */
export function rankedCreativeIds(creatives: Creative[], fronts: readonly Front[]): string[] {
  return [...new Set(fronts.flatMap((front) => CREATIVE_CATEGORIES.flatMap((category) => rankCreatives(creatives, front, category)
    .slice(0, CREATIVE_RANKING_LIMIT)
    .map((creative) => creative.id))))];
}
