import { describe, expect, it } from "vitest";
import geo from "../data/brazil-geo.json";
import { DEGREE_SCALE, markerWeight, ORIGIN, projectLatLng } from "./map-projection";

// A projeção só serve se colocar as unidades da RPC sobre o mesmo território
// que já está desenhado em cena. Os testes abaixo amarram os dois lados: as
// coordenadas reais de cidades conhecidas e os limites do dataset estático.

const outline = geo.outline as Array<[number, number]>;

describe("projectLatLng", () => {
  it("coloca o centro da projeção na origem da cena", () => {
    const { x, y } = projectLatLng(ORIGIN.latitude, ORIGIN.longitude);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(0, 10);
  });

  it("orienta leste para +x e norte para +y", () => {
    const west = projectLatLng(-14.5, -60);
    const east = projectLatLng(-14.5, -40);
    const south = projectLatLng(-30, -54.5);
    const north = projectLatLng(-2, -54.5);
    expect(east.x).toBeGreaterThan(west.x);
    expect(north.y).toBeGreaterThan(south.y);
  });

  it("aplica a mesma escala nos dois eixos", () => {
    const a = projectLatLng(-14.5, -54.5);
    const b = projectLatLng(-15.5, -55.5);
    expect(a.x - b.x).toBeCloseTo(DEGREE_SCALE, 10);
    expect(a.y - b.y).toBeCloseTo(DEGREE_SCALE, 10);
  });

  // Estes pares latitude/longitude são os das cidades de verdade. Os x/y
  // esperados são os que o dataset estático do território usa, o que prova que
  // marcador e desenho compartilham o mesmo sistema de coordenadas.
  it.each([
    ["Campinas/SP", -22.9099, -47.0626, 2.232, -2.523],
    ["São Paulo/SP", -23.5505, -46.6333, 2.36, -2.715],
    ["Belém/PA", -1.4558, -48.4898, 1.803, 3.913],
    ["Porto Alegre/RS", -30.0346, -51.2177, 0.985, -4.66],
    ["Salvador/BA", -12.9777, -38.5016, 4.8, 0.457],
  ])("projeta %s sobre o território", (_label, latitude, longitude, x, y) => {
    const point = projectLatLng(latitude, longitude);
    expect(point.x).toBeCloseTo(x, 2);
    expect(point.y).toBeCloseTo(y, 2);
  });

  it("mantém os extremos geográficos do país dentro do contorno desenhado", () => {
    const xs = outline.map(([x]) => x);
    const ys = outline.map(([, y]) => y);
    const margin = 0.2;
    // Extremos continentais do Brasil: Monte Caburaí (N), Arroio Chuí (S),
    // Serra do Contamana (O) e Ponta do Seixas (L).
    const extremes = [
      projectLatLng(5.2718, -60.7333),
      projectLatLng(-33.7508, -53.3725),
      projectLatLng(-7.5358, -73.9872),
      projectLatLng(-7.1554, -34.7936),
    ];
    for (const point of extremes) {
      expect(point.x).toBeGreaterThanOrEqual(Math.min(...xs) - margin);
      expect(point.x).toBeLessThanOrEqual(Math.max(...xs) + margin);
      expect(point.y).toBeGreaterThanOrEqual(Math.min(...ys) - margin);
      expect(point.y).toBeLessThanOrEqual(Math.max(...ys) + margin);
    }
  });
});

describe("markerWeight", () => {
  it("dá peso cheio à maior cidade e mantém a menor visível", () => {
    expect(markerWeight(38, 38)).toBe(1);
    expect(markerWeight(1, 38)).toBeGreaterThan(0);
  });

  it("comprime a escala em vez de usar proporção direta", () => {
    // Campinas com 38 unidades não pode ficar 38 vezes maior que uma cidade de
    // 1 unidade: a raiz quadrada e o piso seguram a diferença.
    const biggest = markerWeight(38, 38);
    const smallest = markerWeight(1, 38);
    expect(biggest / smallest).toBeLessThan(4);
  });

  it("cresce de forma monotônica com a quantidade de unidades", () => {
    const weights = [1, 2, 5, 12, 27, 38].map((count) => markerWeight(count, 38));
    for (let i = 1; i < weights.length; i += 1) {
      expect(weights[i]).toBeGreaterThanOrEqual(weights[i - 1]);
    }
  });

  it("nunca passa de 1 nem some, mesmo com entrada degenerada", () => {
    for (const weight of [markerWeight(0, 0), markerWeight(5, 1), markerWeight(-3, 10)]) {
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
  });
});
