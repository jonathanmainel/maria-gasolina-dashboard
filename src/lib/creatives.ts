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

/** Teto de cards da seção, já expandida — e de previews buscados por frente. */
export const CREATIVE_RANKING_LIMIT = 9;

/**
 * Criativos de uma frente, só de Meta Ads, do maior para o menor número de
 * leads. O desempate por id mantém a ordem estável entre renders quando duas
 * peças empatam em leads.
 */
export function rankCreatives(creatives: Creative[], front: Front): Creative[] {
  return creatives
    .filter((creative) => creative.front === front && creative.channel === "meta_ads")
    .sort((a, b) => b.leads - a.leads || a.id.localeCompare(b.id));
}

/**
 * Ids que a seção pode exibir em cada frente, que são exatamente os que
 * precisam de preview. Fonte única para a tela e para o enriquecimento na
 * leitura, para os dois limites não voltarem a divergir.
 */
export function rankedCreativeIds(creatives: Creative[], fronts: readonly Front[]): string[] {
  return fronts.flatMap((front) => rankCreatives(creatives, front)
    .slice(0, CREATIVE_RANKING_LIMIT)
    .map((creative) => creative.id));
}
