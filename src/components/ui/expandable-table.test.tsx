// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignTable } from "../CampaignTable";
import { DEFAULT_TABLE_PREVIEW_ROWS } from "./expandable-table";
import type { CampaignRow, EntityItem } from "../../types";
import { DetailExplorer } from "../../views/DetailExplorer";

// Comportamento compartilhado de Top 5 + "Ver mais" nas tabelas de mídia.
// A aba Site é coberta em SiteView.test.tsx, com as mesmas regras.

const kpis = { has_data: true, spend: 50, impressions: 900, clicks: 40, results: 3, ctr: 4.4, cpc: 1.25, cpm: 55, cost_per_result: 16.6 };
const FRANQ = "MG | SEARCH | MAX.CONV | FRANQ";

/**
 * 20 palavras-chave da mesma campanha FRANQ. Investimento decresce e resultados
 * crescem, então Investimento e Resultados produzem rankings opostos — é o que
 * prova que a ordenação roda sobre o dataset inteiro, e não sobre as 5 linhas
 * que já estavam na tela.
 */
const keywords: EntityItem[] = Array.from({ length: 20 }, (_, i) => ({
  ...kpis, level: "keyword" as const, source: "google_ads" as const,
  item_id: `k${i}`, item_name: `kw ${String(i).padStart(2, "0")}`,
  item_status: "ENABLED", keyword_match_type: "EXACT",
  parent_id: "g-f", parent_name: "Mercado autônomo",
  spend: 1000 - i * 10, results: i + 1,
}));

const groups: EntityItem[] = [{
  ...kpis, level: "group", source: "google_ads", item_id: "g-f", item_name: "Mercado autônomo",
  item_status: "ENABLED", parent_id: "c-f", parent_name: FRANQ,
}];

const ads: EntityItem[] = Array.from({ length: 8 }, (_, i) => ({
  ...kpis, level: "ad" as const, source: "google_ads" as const,
  item_id: `a${i}`, item_name: `anúncio ${i}`, item_status: "ENABLED",
  parent_id: "g-f", parent_name: "Mercado autônomo", spend: 500 - i,
}));

const metaAds: EntityItem[] = Array.from({ length: 7 }, (_, i) => ({
  ...kpis, level: "ad" as const, source: "meta_ads" as const,
  item_id: `ma${i}`, item_name: `meta ${i}`, item_status: "ACTIVE",
  parent_id: "m-f", parent_name: "Lookalike 2%", spend: 400 - i,
}));

const metaGroups: EntityItem[] = [{
  ...kpis, level: "group", source: "meta_ads", item_id: "m-f", item_name: "Lookalike 2%",
  item_status: "ACTIVE", parent_id: "mc-f", parent_name: "MG | LEADS | FRANQUIA",
}];

const entities: Record<string, EntityItem[]> = {
  "google_ads:keyword": keywords,
  "google_ads:group": groups,
  "google_ads:ad": ads,
  "google_ads:campaign": [{ ...kpis, level: "campaign", source: "google_ads", item_id: "c-f", item_name: FRANQ, item_status: "ENABLED", parent_id: null, parent_name: null }],
  "meta_ads:ad": metaAds,
  "meta_ads:group": metaGroups,
  "meta_ads:campaign": [{ ...kpis, level: "campaign", source: "meta_ads", item_id: "mc-f", item_name: "MG | LEADS | FRANQUIA", item_status: "ACTIVE", parent_id: null, parent_name: null }],
};

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  getAllEntities: vi.fn(async (source: string, level: string) => ({ items: entities[`${source}:${level}`] ?? [], truncated: false })),
  getAllPmax: vi.fn(async () => ({ items: [], truncated: false })),
  getClientId: vi.fn(async () => 42),
}));

vi.mock("../../lib/creative-previews", () => ({ getMetaCreativePreviews: vi.fn(async () => new Map()) }));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(cleanup);

const range = { start: "2026-08-25", end: "2026-09-23" };
const wrap = (ui: ReactNode) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;

const rowNames = () => [...document.querySelectorAll(".desktop-table tbody tr")]
  .map((tr) => tr.querySelector("strong")?.childNodes[0]?.textContent?.trim());
const count = () => document.querySelector(".table-foot .table-count")!.textContent;
const toggle = () => screen.queryByRole("button", { name: /Ver mais|Mostrar menos/ });
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("constante compartilhada", () => {
  it("a prévia das tabelas analíticas é de 5 linhas", () => {
    expect(DEFAULT_TABLE_PREVIEW_ROWS).toBe(5);
  });
});

describe("detalhamento de mídia: Top 5 e expansão", () => {
  const openKeywords = async () => {
    render(wrap(<DetailExplorer front="franchise" range={range} channelFilter="google_ads" campaigns={[]} />));
    openTab("Palavras-chave");
    await waitFor(() => expect(rowNames().length).toBeGreaterThan(0));
  };

  it("palavras-chave abrem no Top 5 por Investimento DESC", async () => {
    await openKeywords();
    expect(rowNames()).toHaveLength(5);
    // spend = 1000 - i * 10, então o maior investimento é a kw 00.
    expect(rowNames()).toEqual(["[kw 00]", "[kw 01]", "[kw 02]", "[kw 03]", "[kw 04]"]);
    expect(count()).toBe("Exibindo 5 de 20");
    expect(toggle()!.textContent).toBe("Ver mais (15)");
  });

  it("Ver mais revela as 20 de uma vez e Mostrar menos volta para 5", async () => {
    await openKeywords();
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(20));
    expect(count()).toBe("Exibindo 20 de 20");
    expect(toggle()!.textContent).toBe("Mostrar menos");
    expect(toggle()!.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(5));
    expect(count()).toBe("Exibindo 5 de 20");
  });

  it("ordenar por Resultados considera as 20 palavras-chave, não as 5 visíveis", async () => {
    await openKeywords();
    // results = i + 1: os maiores estão no fim do dataset, fora do Top 5 inicial.
    fireEvent.click(screen.getByRole("button", { name: "Resultados" }));
    await waitFor(() => expect(rowNames()).toEqual(["[kw 19]", "[kw 18]", "[kw 17]", "[kw 16]", "[kw 15]"]));
  });

  it("segundo clique inverte para crescente e mostra os 5 menores", async () => {
    await openKeywords();
    const header = screen.getByRole("button", { name: "Resultados" });
    fireEvent.click(header);
    await waitFor(() => expect(rowNames()[0]).toBe("[kw 19]"));
    fireEvent.click(header);
    await waitFor(() => expect(rowNames()).toEqual(["[kw 00]", "[kw 01]", "[kw 02]", "[kw 03]", "[kw 04]"]));
  });

  it("mudar a ordenação recolhe a tabela de volta para 5", async () => {
    await openKeywords();
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(20));

    fireEvent.click(screen.getByRole("button", { name: "Resultados" }));
    await waitFor(() => expect(rowNames()).toHaveLength(5));
    expect(count()).toBe("Exibindo 5 de 20");
  });

  it("trocar de nível recolhe: Palavras-chave expandidas → Anúncios volta a 5", async () => {
    // Visão geral: Palavras-chave vêm do Google e Anúncios, do Meta.
    render(wrap(<DetailExplorer front="franchise" range={range} channelFilter="all" campaigns={[]} />));
    openTab("Palavras-chave");
    await waitFor(() => expect(rowNames()).toHaveLength(5));
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(20));

    openTab("Anúncios");
    await waitFor(() => expect(rowNames()).toHaveLength(5));
    expect(count()).toBe("Exibindo 5 de 7");
    expect(toggle()!.textContent).toBe("Ver mais (2)");
  });

  it("trocar de canal recolhe a tabela", async () => {
    const { rerender } = render(wrap(<DetailExplorer front="franchise" range={range} channelFilter="google_ads" campaigns={[]} />));
    openTab("Palavras-chave");
    await waitFor(() => expect(rowNames()).toHaveLength(5));
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(20));

    rerender(wrap(<DetailExplorer front="franchise" range={range} channelFilter="all" campaigns={[]} />));
    await waitFor(() => expect(rowNames()).toHaveLength(5));
    expect(count()).toBe("Exibindo 5 de 20");
  });

  it("trocar o período recolhe a tabela", async () => {
    const { rerender } = render(wrap(<DetailExplorer front="franchise" range={range} channelFilter="google_ads" campaigns={[]} />));
    openTab("Palavras-chave");
    await waitFor(() => expect(rowNames()).toHaveLength(5));
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(20));

    rerender(wrap(<DetailExplorer front="franchise" range={{ start: "2026-07-01", end: "2026-07-31" }} channelFilter="google_ads" campaigns={[]} />));
    await waitFor(() => expect(rowNames()).toHaveLength(5));
  });

  it("não busca menos dados por causa do recorte visual", async () => {
    const api = await import("../../lib/api");
    await openKeywords();
    // getAllEntities é chamado com (source, level, range): nenhum limite de 5.
    for (const call of vi.mocked(api.getAllEntities).mock.calls) {
      expect(call).toHaveLength(3);
      expect(call[2]).toEqual(range);
    }
    // E as 20 linhas continuam disponíveis para a expansão.
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(20));
  });
});

const campaign = (id: string, name: string, spend: number, leads: number): CampaignRow => ({
  id, name, front: "franchise", channel: "google_ads", objective: "Rede de Pesquisa", status: "ACTIVE",
  spend, impressions: 1000, clicks: 50, leads, cpl: leads ? spend / leads : null, ctr: 5, cpc: 1,
});

describe("CampaignTable: Top 5 e expansão", () => {
  // Investimento decresce e leads crescem: dois rankings opostos.
  const campaigns = Array.from({ length: 12 }, (_, i) => campaign(`c${i}`, `Campanha ${String(i).padStart(2, "0")}`, 1000 - i * 10, i + 1));

  it("abre com 5 campanhas e preserva o resumo de leads no rodapé", () => {
    render(<CampaignTable campaigns={campaigns} />);
    expect(rowNames()).toHaveLength(5);
    expect(count()).toBe("Exibindo 5 de 12 · 78 leads");
    expect(toggle()!.textContent).toBe("Ver mais (7)");
  });

  it("ordena por Leads DESC por padrão, sobre o dataset completo", () => {
    render(<CampaignTable campaigns={campaigns} />);
    expect(rowNames()).toEqual(["Campanha 11", "Campanha 10", "Campanha 09", "Campanha 08", "Campanha 07"]);
  });

  it("Ver mais e Mostrar menos alternam entre 12 e 5", async () => {
    render(<CampaignTable campaigns={campaigns} />);
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(12));
    expect(toggle()!.textContent).toBe("Mostrar menos");
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(5));
  });

  it("ordenar por Investimento recolhe e mostra o Top 5 daquele critério", async () => {
    render(<CampaignTable campaigns={campaigns} />);
    fireEvent.click(toggle()!);
    await waitFor(() => expect(rowNames()).toHaveLength(12));

    fireEvent.click(screen.getByRole("button", { name: /Investimento/ }));
    await waitFor(() => expect(rowNames()).toEqual(["Campanha 00", "Campanha 01", "Campanha 02", "Campanha 03", "Campanha 04"]));
    expect(count()).toBe("Exibindo 5 de 12 · 78 leads");
  });

  it("com 5 ou menos campanhas não existe ação no rodapé", () => {
    render(<CampaignTable campaigns={campaigns.slice(0, 5)} />);
    expect(rowNames()).toHaveLength(5);
    expect(toggle()).toBeNull();

    cleanup();
    render(<CampaignTable campaigns={campaigns.slice(0, 3)} />);
    expect(rowNames()).toHaveLength(3);
    expect(count()).toBe("Exibindo 3 de 3 · 6 leads");
    expect(toggle()).toBeNull();
  });

  it("no mobile os cards também começam em 5", async () => {
    render(<CampaignTable campaigns={campaigns} />);
    const mobileRows = () => document.querySelectorAll(".mobile-rows .mobile-row");
    expect(mobileRows()).toHaveLength(5);
    fireEvent.click(toggle()!);
    await waitFor(() => expect(mobileRows()).toHaveLength(12));
  });

  it("cada tabela guarda o próprio estado de expansão", async () => {
    render(<div><CampaignTable campaigns={campaigns} /><CampaignTable campaigns={campaigns} /></div>);
    const tables = [...document.querySelectorAll(".table-wrap")] as HTMLElement[];
    const rowsOf = (el: HTMLElement) => el.querySelectorAll(".desktop-table tbody tr");
    expect(rowsOf(tables[0])).toHaveLength(5);
    expect(rowsOf(tables[1])).toHaveLength(5);

    fireEvent.click(within(tables[0]).getByRole("button", { name: /Ver mais/ }));
    await waitFor(() => expect(rowsOf(tables[0])).toHaveLength(12));
    expect(rowsOf(tables[1])).toHaveLength(5);
  });
});
