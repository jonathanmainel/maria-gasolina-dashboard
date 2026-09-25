// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkCity, NetworkMapCity, NetworkUnitsSnapshot } from "../types";

// O hero do mapa lido pelo que aparece na tela.
//
// O canvas 3D é substituído por um marcador de teste que expõe as cidades
// recebidas: assim dá para afirmar que são 23 marcadores com as contagens da
// RPC, e não os 147 fictícios do dataset antigo.

// O mock é no limite do Supabase, não no hook: assim a RPC de verdade é
// exercitada, incluindo a normalização do jsonb e a projeção das coordenadas.
const rpc = vi.fn();
vi.mock("../lib/supabase", () => ({ isSupabaseConfigured: true, supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

let rendered: NetworkMapCity[] = [];
vi.mock("./three/BrazilMap", () => ({
  BrazilMap: ({ cities }: { cities: NetworkMapCity[] }) => {
    rendered = cities;
    return (
      <div data-testid="map">
        {cities.map((city) => (
          <span key={city.key} data-testid="marker" data-hq={city.isHeadquarters}>
            {city.city} {city.unitCount}
          </span>
        ))}
      </div>
    );
  },
}));

const { NetworkHero } = await import("./NetworkHero");

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
  ["Hortolândia", "SP", 2, -22.8584, -47.22],
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
  ["Florianópolis", "SC", 2, -27.5949, -48.548],
  ["Brasília", "DF", 1, -15.7939, -47.8828],
];

const cities: NetworkCity[] = cityRows.map(([city, state, units, latitude, longitude]) => ({
  city, state,
  normalized_city: city.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase(),
  unit_count: units, resolved: true, municipality_ibge_code: 1, latitude, longitude,
}));

const snapshot: NetworkUnitsSnapshot = {
  units: [],
  cities,
  summary: {
    total_units: cities.reduce((sum, city) => sum + city.unit_count, 0),
    total_cities: cities.length,
    unresolved_cities: 0,
    last_import_at: "2026-09-25T12:40:00.000Z",
    last_import: null,
  },
  headquarters: { city: "Campinas", state: "SP" },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rendered = [];
  rpc.mockReset();
});

/** Resposta da RPC no formato `{ data, error }` do supabase-js. */
const rpcResolves = (data: unknown) => rpc.mockResolvedValue({ data, error: null });
const rpcFails = (message: string) => rpc.mockResolvedValue({ data: null, error: new Error(message) });
afterEach(cleanup);

describe("hero da rede com dados reais", () => {
  it("mostra unidades, cidades e estados vindos da RPC", async () => {
    rpcResolves(snapshot);
    render(<NetworkHero />, { wrapper });

    await waitFor(() => expect(screen.getByText("Unidades")).not.toBeNull());
    // 101 unidades, 23 cidades e 6 UFs (SP, RJ, MG, PR, SC, DF) — todos
    // derivados do retorno, nenhum constante no componente.
    await waitFor(() => expect(screen.getByText("101")).not.toBeNull());
    expect(screen.getByText("23")).not.toBeNull();
    expect(screen.getByText("6")).not.toBeNull();
    expect(screen.getByText("Cidades")).not.toBeNull();
    expect(screen.getByText("Estados")).not.toBeNull();
  });

  it("desenha um marcador por cidade, com a contagem de cada uma", async () => {
    rpcResolves(snapshot);
    render(<NetworkHero />, { wrapper });

    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(23));
    expect(rendered.find((city) => city.city === "Campinas")?.unitCount).toBe(38);
    expect(rendered.reduce((sum, city) => sum + city.unitCount, 0)).toBe(101);
  });

  it("identifica a sede em um único ponto de Campinas", async () => {
    rpcResolves(snapshot);
    render(<NetworkHero />, { wrapper });

    await waitFor(() => expect(screen.getAllByTestId("marker").length).toBeGreaterThan(0));
    const headquarters = screen.getAllByTestId("marker").filter((node) => node.dataset.hq === "true");
    expect(headquarters).toHaveLength(1);
    expect(headquarters[0].textContent).toContain("Campinas 38");
    // Leitura acessível: a sede é anunciada como sede, não só pelo dourado.
    expect(screen.getByText(/Campinas · SP · Sede: 38 unidades/)).not.toBeNull();
  });

  it("não fala mais em leads, praças em negociação nem em 147 unidades", async () => {
    rpcResolves(snapshot);
    const { container } = render(<NetworkHero />, { wrapper });

    await waitFor(() => expect(screen.getByText("101")).not.toBeNull());
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/lead/i);
    expect(text).not.toMatch(/negocia/i);
    expect(text).not.toMatch(/praça/i);
    expect(text).not.toContain("147");
    expect(text).not.toMatch(/apontam/i);
    // A legenda tem só sede e unidades: nada de azul.
    const legend = container.querySelector(".hero-legend")!;
    expect([...legend.querySelectorAll("span")].map((node) => node.textContent)).toEqual(["Sede", "Unidades"]);
  });

  it("usa a copy da rede real no lugar da antiga", async () => {
    rpcResolves(snapshot);
    render(<NetworkHero />, { wrapper });
    expect(screen.getByText("Onde a Maria Gasolina já está")).not.toBeNull();
    expect(screen.getByText("Rede em expansão")).not.toBeNull();
  });

  it("mantém a moldura do hero enquanto carrega", () => {
    rpc.mockReturnValue(new Promise(() => {}));
    const { container } = render(<NetworkHero />, { wrapper });

    expect(container.querySelector(".panel.hero")).not.toBeNull();
    expect(screen.getByText("Onde a Maria Gasolina já está")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/Carregando/);
    expect(screen.queryByTestId("map")).toBeNull();
  });

  it("mostra indisponibilidade em vez de cidades fictícias quando a RPC falha", async () => {
    rpcFails("DASHBOARD_CLIENT_NOT_FOUND_OR_FORBIDDEN");
    const { container } = render(<NetworkHero />, { wrapper });

    // `useNetworkUnits` tenta uma vez mais antes de desistir, por isso a espera
    // é mais longa que o padrão.
    await waitFor(
      () => expect(screen.getByText("Não foi possível carregar a distribuição das unidades.")).not.toBeNull(),
      { timeout: 5000 },
    );
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByTestId("marker")).toBeNull();
    const text = container.textContent ?? "";
    expect(text).not.toContain("147");
    expect(text).not.toContain("101");
    // O bloco continua sendo o hero: a Visão executiva não quebra em volta.
    expect(container.querySelector(".panel.hero")).not.toBeNull();
    expect(screen.getByText("Onde a Maria Gasolina já está")).not.toBeNull();
  });

  it("avisa quando a base está vazia, sem desenhar mapa", async () => {
    rpcResolves({
      ...snapshot,
      cities: [],
      summary: { total_units: 0, total_cities: 0, unresolved_cities: 0, last_import_at: null, last_import: null },
    });
    render(<NetworkHero />, { wrapper });

    await waitFor(() => expect(screen.getByText("Nenhuma unidade importada ainda.")).not.toBeNull());
    expect(screen.queryByTestId("map")).toBeNull();
  });

  it("não refaz a leitura a cada montagem", async () => {
    rpcResolves(snapshot);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = render(<NetworkHero />, { wrapper: shared });
    await waitFor(() => expect(screen.getAllByTestId("marker").length).toBeGreaterThan(0));
    first.unmount();
    render(<NetworkHero />, { wrapper: shared });
    await waitFor(() => expect(screen.getAllByTestId("marker").length).toBeGreaterThan(0));

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
