import { describe, expect, it } from "vitest";
import { CREATIVE_RANKING_LIMIT, CREATIVE_RANKING_PREVIEW, rankCreatives, rankedCreativeIds } from "./creatives";
import type { Creative, Front } from "../types";

const creative = (over: Partial<Creative> & { id: string }): Creative => ({
  name: over.id, front: "franchise", channel: "meta_ads", format: "image",
  headline: "Campanha", palette: ["#123456", "#654321"], spend: 100, impressions: 1000,
  clicks: 50, leads: 5, cpl: 20, ctr: 5, hook_rate: null, ...over,
});

describe("ranking de criativos: só peças de Meta Ads", () => {
  // O Google lidera em leads nos dois casos — se o canal fosse filtrado depois
  // da ordenação, ele ocuparia o topo (ou deixaria buracos ao ser removido).
  const mixed: Creative[] = [
    creative({ id: "google-search", channel: "google_ads", name: "GT+ | SEARCH | MAX.CLIQUES - COND", leads: 100 }),
    creative({ id: "meta-a", leads: 80 }),
    creative({ id: "google-pmax", channel: "google_ads", name: "MG | PERFORMANCE MAX | FRANQ", leads: 70 }),
    creative({ id: "meta-b", leads: 60 }),
    creative({ id: "meta-c", leads: 40 }),
  ];

  it("descarta Google Search mesmo quando ele tem mais leads que todo o Meta", () => {
    const ranked = rankCreatives(mixed, "franchise");
    expect(ranked.map((c) => c.id)).toEqual(["meta-a", "meta-b", "meta-c"]);
    expect(ranked.some((c) => c.channel === "google_ads")).toBe(false);
  });

  it("descarta PMax e qualquer outro anúncio do Google", () => {
    const ranked = rankCreatives(mixed, "franchise");
    expect(ranked.find((c) => c.id === "google-pmax")).toBeUndefined();
    expect(ranked.every((c) => c.channel === "meta_ads")).toBe(true);
  });

  it("o ranking do Meta recomeça em 1, sem buraco deixado pelo Google", () => {
    // A posição no array é a posição exibida: Meta A é o 1º, não o 2º.
    expect(rankCreatives(mixed, "franchise").findIndex((c) => c.id === "meta-a")).toBe(0);
  });

  it("filtra o canal antes de ordenar, e não depois de recortar", () => {
    // 12 anúncios do Google com mais leads que qualquer Meta: se o corte viesse
    // antes do filtro de canal, nenhuma peça Meta sobraria.
    const googleHeavy = [
      ...Array.from({ length: 12 }, (_, i) => creative({ id: `g-${i}`, channel: "google_ads", leads: 1000 - i })),
      ...Array.from({ length: 4 }, (_, i) => creative({ id: `m-${i}`, leads: 10 - i })),
    ];
    expect(rankCreatives(googleHeavy, "franchise").map((c) => c.id)).toEqual(["m-0", "m-1", "m-2", "m-3"]);
  });

  it("ordena por leads, do maior para o menor, com desempate estável", () => {
    const tied = [
      creative({ id: "z", leads: 10 }), creative({ id: "a", leads: 10 }), creative({ id: "m", leads: 50 }),
    ];
    expect(rankCreatives(tied, "franchise").map((c) => c.id)).toEqual(["m", "a", "z"]);
  });

  it("nunca mistura as frentes", () => {
    const both = [
      creative({ id: "franq-1", front: "franchise", leads: 10 }),
      creative({ id: "cond-1", front: "condominium", leads: 90 }),
      creative({ id: "cond-2", front: "condominium", leads: 80 }),
    ];
    expect(rankCreatives(both, "franchise").map((c) => c.id)).toEqual(["franq-1"]);
    expect(rankCreatives(both, "condominium").map((c) => c.id)).toEqual(["cond-1", "cond-2"]);
  });

  it("devolve lista vazia quando a frente não tem nenhuma peça de Meta", () => {
    const onlyGoogle = [creative({ id: "g1", channel: "google_ads", leads: 100 })];
    expect(rankCreatives(onlyGoogle, "franchise")).toEqual([]);
  });

  it("não inventa placeholders quando há menos peças que o limite", () => {
    const two = [creative({ id: "m1", leads: 9 }), creative({ id: "m2", leads: 8 })];
    expect(rankCreatives(two, "franchise")).toHaveLength(2);
  });
});

describe("ids enriquecidos com preview", () => {
  const fronts: readonly Front[] = ["franchise", "condominium"];

  it("pede preview para os 9 primeiros de cada frente", () => {
    const many = (front: Front, prefix: string) =>
      Array.from({ length: 14 }, (_, i) => creative({ id: `${prefix}-${String(i).padStart(2, "0")}`, front, leads: 100 - i }));
    const ids = rankedCreativeIds([...many("franchise", "f"), ...many("condominium", "c")], fronts);
    expect(ids).toHaveLength(CREATIVE_RANKING_LIMIT * 2);
    expect(ids.slice(0, CREATIVE_RANKING_LIMIT)).toEqual(Array.from({ length: 9 }, (_, i) => `f-${String(i).padStart(2, "0")}`));
    expect(ids.slice(CREATIVE_RANKING_LIMIT)).toEqual(Array.from({ length: 9 }, (_, i) => `c-${String(i).padStart(2, "0")}`));
  });

  it("um Meta empurrado para fora do Top 9 geral pelo Google passa a receber preview", () => {
    // 8 anúncios do Google com muitos leads + 9 peças Meta. No corte antigo
    // (ordenar tudo → cortar → filtrar canal) só sobrava 1 id Meta.
    const google = Array.from({ length: 8 }, (_, i) => creative({ id: `g-${i}`, channel: "google_ads", leads: 1000 - i }));
    const meta = Array.from({ length: 9 }, (_, i) => creative({ id: `m-${i}`, leads: 100 - i }));
    const ids = rankedCreativeIds([...google, ...meta], ["franchise"]);

    expect(ids).toEqual(meta.map((c) => c.id));
    expect(ids).toHaveLength(9);
    // Nenhum id do Google é enviado ao backend de previews.
    expect(ids.some((id) => id.startsWith("g-"))).toBe(false);

    const legacy = [...google, ...meta].sort((a, b) => b.leads - a.leads).slice(0, 8)
      .filter((c) => c.channel === "meta_ads").map((c) => c.id);
    expect(legacy).toEqual([]);
  });

  it("não pede preview quando a frente não tem peças de Meta", () => {
    expect(rankedCreativeIds([creative({ id: "g", channel: "google_ads" })], fronts)).toEqual([]);
  });

  it("o teto de previews é o mesmo teto de cards da seção", () => {
    expect(CREATIVE_RANKING_LIMIT).toBe(9);
    expect(CREATIVE_RANKING_PREVIEW).toBe(3);
  });
});
