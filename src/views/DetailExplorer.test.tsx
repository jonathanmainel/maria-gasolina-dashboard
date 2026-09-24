// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityItem, PmaxItem } from "../types";
import { DetailExplorer } from "./DetailExplorer";

// A API é substituída; classificação, herança de frente, matriz de abas e
// renderização são as reais. Os textos das palavras-chave e dos grupos não
// contêm FRANQ nem COND — a frente só pode vir da campanha ancestral.

const kpis = { has_data: true, spend: 50, impressions: 900, clicks: 40, results: 3, ctr: 4.4, cpc: 1.25, cpm: 55, cost_per_result: 16.6 };
const FRANQ = "MG | SEARCH | MAX.CONV | FRANQ";
const COND = "GT+ | SEARCH | MAX.CLIQUES - COND";
const PMAX_FRANQ = "MG | PERFORMANCE MAX | FRANQ";
const IMAGE = "https://tpc.googlesyndication.com/simgad/franq-quadrada";

const e = (over: Partial<EntityItem>): EntityItem => ({
  ...kpis, level: "group", source: "google_ads", item_id: "x", item_name: "x",
  item_status: "ENABLED", parent_id: null, parent_name: null, ...over,
});

const entities: Record<string, EntityItem[]> = {
  "google_ads:group": [
    e({ item_id: "g-f", item_name: "Mercado autônomo", parent_id: "c-f", parent_name: FRANQ }),
    e({ item_id: "g-c", item_name: "Loja no prédio", parent_id: "c-c", parent_name: COND }),
  ],
  "google_ads:keyword": [
    e({ level: "keyword", item_id: "k1", item_name: "[mercado 24 horas]", parent_id: "g-f", parent_name: "Mercado autônomo" }),
    e({ level: "keyword", item_id: "k2", item_name: "\"minimercado\"", parent_id: "g-c", parent_name: "Loja no prédio" }),
  ],
  "meta_ads:group": [e({ source: "meta_ads", item_id: "m-f", item_name: "Lookalike 2%", parent_id: "mc-f", parent_name: "MG | LEADS | FRANQUIA" })],
  "meta_ads:campaign": [e({ source: "meta_ads", level: "campaign", item_id: "mc-f", item_name: "MG | LEADS | FRANQUIA" })],
  "meta_ads:ad": [e({ source: "meta_ads", level: "ad", item_id: "ma1", item_name: "Vídeo | Renda extra", parent_id: "m-f", parent_name: "Lookalike 2%" })],
};

const p = (over: Partial<PmaxItem>): PmaxItem => ({
  ...kpis, level: "asset", item_id: "p", item_name: "p", item_status: "ENABLED", campaign_id: "c-pf",
  campaign_name: PMAX_FRANQ, asset_group_id: "ag1", asset_group_name: "Express | Geral", field_type: null,
  performance_label: null, text_content: null, image_url: null, youtube_video_id: null, ad_strength: null, ...over,
});

const pmax: Record<string, PmaxItem[]> = {
  asset_group: [p({ level: "asset_group", item_id: "ag1", item_name: "Express | Geral", asset_group_id: null, asset_group_name: null, ad_strength: "GOOD" })],
  asset: [
    p({ item_id: "img", item_name: "Imagem quadrada", field_type: "SQUARE_MARKETING_IMAGE", image_url: IMAGE }),
    p({ item_id: "txt", item_name: "Conveniência que mora com você", field_type: "HEADLINE", text_content: "Conveniência" }),
  ],
};

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  getAllEntities: vi.fn(async (source: string, level: string) => ({ items: entities[`${source}:${level}`] ?? [], truncated: false })),
  getAllPmax: vi.fn(async (level: string) => ({ items: pmax[level] ?? [], truncated: false })),
}));

beforeAll(() => {
  // jsdom não implementa matchMedia; os primitivos de animação consultam.
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => cleanup());

const range = { start: "2026-08-25", end: "2026-09-23" };
type Filter = "all" | "meta_ads" | "google_ads";
const wrap = (ui: ReactNode) => <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
const view = (front: "franchise" | "condominium", channelFilter: Filter) =>
  <DetailExplorer front={front} range={range} channelFilter={channelFilter} campaigns={[]} />;

const tabs = () => screen.getAllByRole("tab").map((t) => t.textContent);
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
const table = () => document.querySelector(".desktop-table table") as HTMLElement;
const rowNames = async () => {
  await waitFor(() => expect(document.querySelector(".desktop-table tbody tr, .empty-state")).not.toBeNull());
  return [...document.querySelectorAll(".desktop-table tbody tr")].map((tr) => tr.querySelector("strong")?.childNodes[0]?.textContent?.trim());
};

describe("Palavras-chave renderizam quando os dados chegam", () => {
  it("Franquias → Google Ads mostra a keyword herdada da campanha FRANQ, não a de COND", async () => {
    render(wrap(view("franchise", "google_ads")));
    openTab("Palavras-chave");
    expect(await rowNames()).toEqual(["[mercado 24 horas]"]);
  });

  it("Condomínios → Google Ads mostra só a keyword da campanha COND", async () => {
    render(wrap(view("condominium", "google_ads")));
    openTab("Palavras-chave");
    expect(await rowNames()).toEqual(["\"minimercado\""]);
  });

  it("Visão geral também tem a aba e mostra as keywords do Google", async () => {
    render(wrap(view("franchise", "all")));
    expect(tabs()).toContain("Palavras-chave");
    openTab("Palavras-chave");
    expect(await rowNames()).toEqual(["[mercado 24 horas]"]);
  });

  it("Meta Ads não tem a aba Palavras-chave", () => {
    render(wrap(view("franchise", "meta_ads")));
    expect(tabs()).toEqual(["Campanhas", "Conjuntos de anúncios", "Anúncios"]);
  });

  it("troca de filtro: Palavras-chave → Meta volta a Campanhas; → Visão geral mantém", async () => {
    const { rerender } = render(wrap(view("franchise", "google_ads")));
    openTab("Palavras-chave");
    await rowNames();
    rerender(wrap(view("franchise", "all")));
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Palavras-chave");
    rerender(wrap(view("franchise", "meta_ads")));
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe("Campanhas");
  });
});

describe("miniatura PMax: só em Anúncios", () => {
  it("Grupos de anúncios mostra o grupo PMax com selo, mas sem caixa de imagem", async () => {
    render(wrap(view("franchise", "google_ads")));
    openTab("Grupos de anúncios");
    expect(await rowNames()).toEqual(expect.arrayContaining(["Express | Geral", "Mercado autônomo"]));
    expect(table().querySelectorAll(".chip.pmax")).toHaveLength(1);
    expect(table().querySelector(".asset-preview")).toBeNull();
  });

  it("Anúncios mostra miniatura dos recursos PMax", async () => {
    render(wrap(view("franchise", "google_ads")));
    openTab("Anúncios");
    expect(await rowNames()).toEqual(expect.arrayContaining(["Imagem quadrada", "Conveniência que mora com você"]));
    expect(table().querySelectorAll(".asset-preview")).toHaveLength(2);
  });
});

describe("visualização ampliada", () => {
  const openAds = async () => {
    render(wrap(view("franchise", "google_ads")));
    openTab("Anúncios");
    await rowNames();
  };
  const thumb = () => within(table()).getByRole("button", { name: "Ampliar imagem: Imagem quadrada" });

  it("clicar na miniatura abre o diálogo com a imagem grande", async () => {
    await openAds();
    fireEvent.click(thumb());
    const dialog = screen.getByRole("dialog", { name: "Imagem ampliada: Imagem quadrada" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByRole("img").getAttribute("src")).toBe(IMAGE);
    // O foco vai para o botão de fechar.
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Fechar imagem ampliada" }));
  });

  it("fecha pelo botão e devolve o foco à miniatura", async () => {
    await openAds();
    const button = thumb();
    button.focus();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Fechar imagem ampliada" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("fecha pelo clique no fundo", async () => {
    await openAds();
    fireEvent.click(thumb());
    fireEvent.click(screen.getByTestId("lightbox-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("fecha pela tecla Esc", async () => {
    await openAds();
    fireEvent.click(thumb());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clicar na própria imagem ampliada não fecha", async () => {
    await openAds();
    fireEvent.click(thumb());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("img"));
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("recurso de texto não tem miniatura clicável nem abre diálogo", async () => {
    await openAds();
    expect(within(table()).queryByRole("button", { name: /Conveniência que mora com você/ })).toBeNull();
    fireEvent.click(table().querySelector(".asset-text") as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("imagem que falha ao carregar vira marcador e deixa de ser clicável", async () => {
    await openAds();
    act(() => { fireEvent.error(thumb().querySelector("img") as HTMLImageElement); });
    expect(within(table()).queryByRole("button", { name: "Ampliar imagem: Imagem quadrada" })).toBeNull();
    expect(table().querySelectorAll(".asset-placeholder").length).toBeGreaterThan(0);
  });
});
