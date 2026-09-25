import { describe, expect, it } from "vitest";
import { networkStateCount, normalizeSnapshot, toMapCities, unitCountLabel } from "./network-units";
import { projectLatLng } from "./map-projection";
import type { NetworkCity, NetworkUnitsSnapshot } from "../types";

// Fixture no formato exato do jsonb de `get_dashboard_network_units`.
//
// Os volumes reproduzem a base real importada — 101 unidades em 23 cidades,
// Campinas com 38 — para provar que os números da tela saem do retorno da RPC.
// Nada no código de produção conhece esses valores.

const cityRows: Array<[string, string, number, number, number]> = [
  ["Campinas", "SP", 38, -22.9099, -47.0626],
  ["São Paulo", "SP", 12, -23.5505, -46.6333],
  ["Jundiaí", "SP", 6, -23.1857, -46.8978],
  ["Indaiatuba", "SP", 5, -23.0816, -47.2101],
  ["Valinhos", "SP", 4, -22.9707, -46.9958],
  ["Americana", "SP", 3, -22.7397, -47.3313],
  ["Piracicaba", "SP", 3, -22.7253, -47.6492],
  ["Sorocaba", "SP", 2, -23.5015, -47.4526],
  ["Ribeirão Preto", "SP", 2, -21.1775, -47.8103],
  ["Santos", "SP", 2, -23.9608, -46.3336],
  ["Hortolândia", "SP", 2, -22.8584, -47.2200],
  ["Sumaré", "SP", 2, -22.8219, -47.2669],
  ["Paulínia", "SP", 1, -22.7612, -47.1543],
  ["Vinhedo", "SP", 1, -23.0299, -46.9752],
  ["Louveira", "SP", 1, -23.0865, -46.9506],
  ["Itu", "SP", 1, -23.2643, -47.2992],
  ["Salto", "SP", 1, -23.2007, -47.2872],
  ["Limeira", "SP", 1, -22.5641, -47.4017],
  ["Rio de Janeiro", "RJ", 5, -22.9068, -43.1729],
  ["Belo Horizonte", "MG", 4, -19.9167, -43.9345],
  ["Curitiba", "PR", 2, -25.4284, -49.2733],
  ["Florianópolis", "SC", 2, -27.5949, -48.5480],
  ["Brasília", "DF", 1, -15.7939, -47.8828],
];

const cities: NetworkCity[] = cityRows.map(([city, state, units, latitude, longitude]) => ({
  city,
  state,
  normalized_city: city.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase(),
  unit_count: units,
  resolved: true,
  municipality_ibge_code: 3509502,
  latitude,
  longitude,
}));

const totalUnits = cities.reduce((sum, city) => sum + city.unit_count, 0);

const snapshot: NetworkUnitsSnapshot = {
  units: [],
  cities,
  summary: {
    total_units: totalUnits,
    total_cities: cities.length,
    unresolved_cities: 0,
    last_import_at: "2026-09-25T12:40:00.000Z",
    last_import: {
      id: 7,
      filename: "Relatorio Lojas CEPs - Setembro 2026.xlsx",
      status: "success",
      total_rows: 102,
      valid_rows: 101,
      duplicate_rows: 1,
      invalid_rows: 0,
      unresolved_cities: 0,
      created_at: "2026-09-25T12:39:50.000Z",
      completed_at: "2026-09-25T12:40:00.000Z",
    },
  },
  headquarters: { city: "Campinas", state: "SP" },
};

describe("contrato da RPC get_dashboard_network_units", () => {
  it("entrega a base real com 101 unidades em 23 cidades", () => {
    expect(snapshot.summary.total_units).toBe(101);
    expect(snapshot.summary.total_cities).toBe(23);
    expect(snapshot.cities).toHaveLength(snapshot.summary.total_cities);
    expect(cities.reduce((sum, city) => sum + city.unit_count, 0)).toBe(snapshot.summary.total_units);
  });

  it("traz o resumo da última importação bem-sucedida", () => {
    const last = snapshot.summary.last_import;
    expect(last?.filename).toBe("Relatorio Lojas CEPs - Setembro 2026.xlsx");
    expect(last?.status).toBe("success");
    expect(last?.total_rows).toBe(102);
    expect(last?.valid_rows).toBe(101);
    expect(last?.duplicate_rows).toBe(1);
    expect(snapshot.summary.last_import_at).toBe("2026-09-25T12:40:00.000Z");
  });

  it("traz a sede separada das cidades", () => {
    expect(snapshot.headquarters).toEqual({ city: "Campinas", state: "SP" });
  });
});

describe("normalizeSnapshot", () => {
  it("preserva o retorno íntegro da RPC", () => {
    expect(normalizeSnapshot(snapshot)).toEqual(snapshot);
  });

  it("não inventa números quando o resumo vem incompleto", () => {
    const result = normalizeSnapshot({ cities: [], summary: {} });
    expect(result.summary.total_units).toBe(0);
    expect(result.summary.total_cities).toBe(0);
    expect(result.summary.last_import).toBeNull();
    expect(result.summary.last_import_at).toBeNull();
    expect(result.cities).toEqual([]);
  });

  it("sobrevive a um retorno nulo sem quebrar a tela", () => {
    const result = normalizeSnapshot(null);
    expect(result.cities).toEqual([]);
    expect(result.summary.total_units).toBe(0);
  });
});

describe("networkStateCount", () => {
  it("deriva as UFs distintas das cidades recebidas", () => {
    // SP, RJ, MG, PR, SC, DF na fixture.
    expect(networkStateCount(cities)).toBe(6);
  });

  it("é zero sem cidades", () => {
    expect(networkStateCount([])).toBe(0);
  });
});

describe("toMapCities", () => {
  const mapCities = toMapCities(snapshot);

  it("desenha um marcador por cidade, e não um por unidade", () => {
    expect(mapCities).toHaveLength(23);
    expect(mapCities.length).toBeLessThan(snapshot.summary.total_units);
  });

  it("tira a contagem de cada marcador do retorno da RPC", () => {
    const campinas = mapCities.find((city) => city.city === "Campinas");
    expect(campinas?.unitCount).toBe(38);
    expect(mapCities.reduce((sum, city) => sum + city.unitCount, 0)).toBe(101);
  });

  it("projeta a coordenada real de cada cidade", () => {
    const campinas = mapCities.find((city) => city.city === "Campinas")!;
    const expected = projectLatLng(-22.9099, -47.0626);
    expect(campinas.x).toBeCloseTo(expected.x, 10);
    expect(campinas.y).toBeCloseTo(expected.y, 10);
  });

  it("marca a sede no próprio ponto de Campinas, sem somar uma unidade", () => {
    const headquarters = mapCities.filter((city) => city.isHeadquarters);
    expect(headquarters).toHaveLength(1);
    expect(headquarters[0].city).toBe("Campinas");
    expect(headquarters[0].unitCount).toBe(38);
    // Um único ponto em Campinas: a sede não gera marcador extra deslocado.
    const atCampinas = mapCities.filter((city) => city.city === "Campinas");
    expect(atCampinas).toHaveLength(1);
  });

  it("reconhece a sede mesmo com acento e caixa diferentes", () => {
    const withAccent = toMapCities({
      ...snapshot,
      cities: [{ ...cities[0], city: "Campinas", normalized_city: "campinas" }],
      headquarters: { city: "CAMPINAS", state: "sp" },
    });
    expect(withAccent[0].isHeadquarters).toBe(true);
  });

  it("deixa fora as cidades sem coordenada, sem descartar o resto", () => {
    const withUnresolved = toMapCities({
      ...snapshot,
      cities: [
        ...cities,
        {
          city: "Cidade Inexistente", state: "SP", normalized_city: "cidade inexistente",
          unit_count: 2, resolved: false, municipality_ibge_code: null, latitude: null, longitude: null,
        },
      ],
    });
    expect(withUnresolved).toHaveLength(23);
    expect(withUnresolved.some((city) => city.city === "Cidade Inexistente")).toBe(false);
  });

  it("dá uma chave estável e única a cada cidade", () => {
    const keys = mapCities.map((city) => city.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("não produz nenhum marcador fora das unidades da rede", () => {
    // O mapa antigo tinha três tipos de ponto (sede, unidade e lead). Agora só
    // existe unidade, com a sede como destaque de uma delas.
    for (const city of mapCities) {
      expect(city.unitCount).toBeGreaterThan(0);
      expect(Object.keys(city).sort()).toEqual(
        ["city", "isHeadquarters", "key", "state", "unitCount", "x", "y"],
      );
    }
  });
});

describe("unitCountLabel", () => {
  it("usa singular só para uma unidade", () => {
    expect(unitCountLabel(1)).toBe("1 unidade");
    expect(unitCountLabel(0)).toBe("0 unidades");
    expect(unitCountLabel(2)).toBe("2 unidades");
    expect(unitCountLabel(38)).toBe("38 unidades");
  });
});
