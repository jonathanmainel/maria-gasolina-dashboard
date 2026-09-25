// ---------------------------------------------------------------------------
// Projeção geográfica do mapa 3D
//
// O `brazil-geo.json` guarda o contorno e a nuvem de pontos do território em um
// sistema x/y próprio, e não em latitude/longitude. Esse sistema é uma projeção
// equirretangular simples em torno do centro geográfico do país: cada grau vale
// `DEGREE_SCALE` unidades de cena, medido a partir de `ORIGIN`.
//
// Os valores abaixo não são estimados: reconstroem exatamente o dataset
// estático já versionado (ver `map-projection.test.ts`, que confere pontos do
// contorno contra as coordenadas reais). Por isso as unidades vindas da RPC
// caem sobre o território no lugar certo, sem nenhuma coordenada guardada no
// frontend.
//
// Equirretangular, e não Mercator, porque o desenho do território que já está
// em cena foi gerado assim — aplicar outra projeção só nos marcadores os
// deslocaria em relação ao contorno.
// ---------------------------------------------------------------------------

/** Centro da projeção, em graus. */
export const ORIGIN = { latitude: -14.5, longitude: -54.5 } as const;

/** Unidades de cena por grau, igual nos dois eixos. */
export const DEGREE_SCALE = 0.3;

export interface MapPoint {
  x: number;
  y: number;
}

/**
 * Converte um par latitude/longitude para a coordenada x/y do mapa.
 *
 * x cresce para leste (longitude maior), y cresce para norte (latitude maior),
 * que é a orientação do dataset e da câmera já em cena.
 */
export function projectLatLng(latitude: number, longitude: number): MapPoint {
  return {
    x: (longitude - ORIGIN.longitude) * DEGREE_SCALE,
    y: (latitude - ORIGIN.latitude) * DEGREE_SCALE,
  };
}

/**
 * Peso visual de um marcador, entre 0 e 1, a partir da contagem de unidades da
 * cidade e da maior contagem do conjunto.
 *
 * Raiz quadrada em vez de proporção direta: com 38 unidades em Campinas e 1 na
 * maioria das cidades, a escala linear apagaria as cidades pequenas e daria a
 * Campinas um marcador que cobriria o estado. O piso garante que uma cidade com
 * uma única unidade continue visível e clicável.
 */
export function markerWeight(unitCount: number, maxUnitCount: number): number {
  const max = Math.max(1, maxUnitCount);
  const count = Math.max(1, Math.min(unitCount, max));
  return Math.min(1, Math.max(0.3, Math.sqrt(count / max)));
}
