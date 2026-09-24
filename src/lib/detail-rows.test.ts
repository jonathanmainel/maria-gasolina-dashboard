import { describe, expect, it } from "vitest";
import { readAllPages } from "./api";
import {
  buildAncestry, buildDetailRows, campaignToRow, entityToRow, frontOf, levelsFor, lookupsFor, planFor, pmaxToRow,
  resolveLevel, sliceByFront,
} from "./detail-rows";
import type { CampaignRow, CursorPage, EntityItem, PmaxItem } from "../types";

const labels = (filter: Parameters<typeof levelsFor>[0]) => levelsFor(filter).map((o) => o.label);
const ids = (filter: Parameters<typeof levelsFor>[0]) => levelsFor(filter).map((o) => o.id);

const kpis = { has_data: true, spend: 100, impressions: 1000, clicks: 50, results: 5, ctr: 5, cpc: 2, cpm: 100, cost_per_result: 20 };

// Árvore realista: os nomes dos filhos não dizem a frente — só a campanha diz.
const FRANQ_CAMPAIGN = "MG | SEARCH | MAX.CONV | FRANQ";
const COND_CAMPAIGN = "GT+ | SEARCH | MAX.CLIQUES - COND";
const META_FRANQ = "MG | LEADS | CBO | FRANQUIA";
const META_COND = "MG | LEADS | CBO | CONDOMÍNIOS";

const e = (over: Partial<EntityItem>): EntityItem => ({
  ...kpis, level: "group", source: "google_ads", item_id: "x", item_name: "Genérico",
  item_status: "ENABLED", parent_id: null, parent_name: null, ...over,
});

const googleCampaigns = [
  e({ level: "campaign", item_id: "c-franq", item_name: FRANQ_CAMPAIGN }),
  e({ level: "campaign", item_id: "c-cond", item_name: COND_CAMPAIGN }),
];
const googleGroups = [
  e({ item_id: "g-franq", item_name: "Mercado autônomo", parent_id: "c-franq", parent_name: FRANQ_CAMPAIGN }),
  e({ item_id: "g-cond", item_name: "Loja no prédio", parent_id: "c-cond", parent_name: COND_CAMPAIGN }),
];
const keywords = [
  // Nenhum texto de palavra-chave contém FRANQ ou COND.
  e({ level: "keyword", item_id: "k1", item_name: "[mercado 24 horas]", parent_id: "g-franq", parent_name: "Mercado autônomo" }),
  e({ level: "keyword", item_id: "k2", item_name: "\"minimercado\"", parent_id: "g-cond", parent_name: "Loja no prédio" }),
];
const metaCampaigns = [
  e({ source: "meta_ads", level: "campaign", item_id: "mc-franq", item_name: META_FRANQ }),
  e({ source: "meta_ads", level: "campaign", item_id: "mc-cond", item_name: META_COND }),
];
const metaGroups = [
  e({ source: "meta_ads", item_id: "ms-franq", item_name: "Lookalike 2%", parent_id: "mc-franq", parent_name: META_FRANQ }),
  e({ source: "meta_ads", item_id: "ms-cond", item_name: "Capitais 30-60", parent_id: "mc-cond", parent_name: META_COND }),
];
const metaAds = [
  e({ source: "meta_ads", level: "ad", item_id: "a1", item_name: "Vídeo | Renda extra", parent_id: "ms-franq", parent_name: "Lookalike 2%" }),
  e({ source: "meta_ads", level: "ad", item_id: "a2", item_name: "Carrossel | Praticidade", parent_id: "ms-cond", parent_name: "Capitais 30-60" }),
  // Sem conjunto: a RPC devolve a própria campanha como pai.
  e({ source: "meta_ads", level: "ad", item_id: "a3", item_name: "Estático | Sem conjunto", parent_id: "mc-cond", parent_name: META_COND }),
];

const pmax = (over: Partial<PmaxItem>): PmaxItem => ({
  ...kpis, level: "asset", item_id: "p", item_name: "Título", item_status: "ENABLED",
  campaign_id: "c-pmax-franq", campaign_name: "MG | PERFORMANCE MAX | FRANQ", asset_group_id: "ag1",
  asset_group_name: "Express | Geral", field_type: "HEADLINE", performance_label: "BEST",
  text_content: "texto", image_url: null, youtube_video_id: null, ad_strength: null, ...over,
});

const campaign = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: "c1", name: FRANQ_CAMPAIGN, front: "franchise", channel: "google_ads", objective: "Rede de Pesquisa",
  status: "ACTIVE", spend: 100, impressions: 1000, clicks: 50, leads: 5, cpl: 20, ctr: 5, cpc: 2, ...over,
});

const ancestry = buildAncestry([...googleGroups, ...metaGroups], [...googleCampaigns, ...metaCampaigns]);
const namesIn = (rows: ReturnType<typeof buildDetailRows>, front: "franchise" | "condominium") =>
  sliceByFront(rows, front).items.map((row) => row.item_id).sort();

describe("1–2. frente da campanha", () => {
  it("campanha FRANQ é Franquias e campanha COND é Condomínios", () => {
    expect(frontOf(campaignToRow(campaign({ name: FRANQ_CAMPAIGN })))).toBe("franchise");
    expect(frontOf(campaignToRow(campaign({ name: COND_CAMPAIGN })))).toBe("condominium");
  });
});

describe("3–7. entidades filhas herdam a frente da campanha ancestral", () => {
  it("3. grupo herda da campanha, ignorando o próprio nome", () => {
    const rows = buildDetailRows([googleGroups], [], ancestry);
    expect(namesIn(rows, "franchise")).toEqual(["g-franq"]);
    expect(namesIn(rows, "condominium")).toEqual(["g-cond"]);
  });

  it("3b. grupo com FRANQ no nome mas em campanha COND fica em Condomínios", () => {
    const tricky = e({ item_id: "g-tricky", item_name: "Franqueados potenciais", parent_id: "c-cond", parent_name: COND_CAMPAIGN });
    const rows = buildDetailRows([[tricky]], [], ancestry);
    expect(namesIn(rows, "condominium")).toEqual(["g-tricky"]);
    expect(namesIn(rows, "franchise")).toEqual([]);
  });

  it("4. anúncio herda pela cadeia anúncio → conjunto → campanha", () => {
    const rows = buildDetailRows([metaAds], [], ancestry);
    expect(namesIn(rows, "franchise")).toEqual(["a1"]);
    expect(namesIn(rows, "condominium")).toEqual(["a2", "a3"]);
  });

  it("4b. anúncio sem conjunto herda direto da campanha", () => {
    const [row] = buildDetailRows([[metaAds[2]]], [], ancestry);
    expect(row.campaign_name).toBe(META_COND);
  });

  it("5. palavra-chave herda pela cadeia palavra-chave → grupo → campanha", () => {
    const rows = buildDetailRows([keywords], [], ancestry);
    expect(rows.map((r) => r.campaign_name)).toEqual([FRANQ_CAMPAIGN, COND_CAMPAIGN]);
  });

  it("6. grupo de recursos PMax herda da campanha, não do próprio nome", () => {
    const group = pmax({ level: "asset_group", item_id: "ag1", item_name: "Express | COND", field_type: null, asset_group_id: null, asset_group_name: null });
    const [row] = buildDetailRows([], [group]);
    expect(frontOf(row)).toBe("franchise");
  });

  it("7. recurso PMax herda da campanha, não do grupo de recursos", () => {
    const asset = pmax({ campaign_name: COND_CAMPAIGN, asset_group_name: "Franquia | Geral" });
    const [row] = buildDetailRows([], [asset]);
    expect(frontOf(row)).toBe("condominium");
  });
});

describe("8. palavra-chave sem FRANQ no texto continua na frente certa", () => {
  it("[mercado 24 horas] pertence a Franquias pela campanha", () => {
    const rows = buildDetailRows([keywords], [], ancestry);
    expect(sliceByFront(rows, "franchise").items.map((r) => r.item_name)).toEqual(["[mercado 24 horas]"]);
  });

  it("sem a cadeia de ancestrais ela ficaria de fora — era a causa da aba vazia", () => {
    const rows = buildDetailRows([keywords]);
    expect(sliceByFront(rows, "franchise").items).toEqual([]);
    expect(sliceByFront(rows, "franchise").outside).toBe(2);
  });

  it("palavra-chave cujo grupo não foi encontrado não é chutada para uma frente", () => {
    const orphan = e({ level: "keyword", item_id: "k9", item_name: "[franquia barata]", parent_id: "g-missing", parent_name: "Grupo sumido" });
    const [row] = buildDetailRows([[orphan]], [], ancestry);
    expect(frontOf(row)).toBeNull();
  });
});

describe("9. paginação", () => {
  const paged = <T,>(pages: T[][]) => (cursor: Record<string, string | number> | null): Promise<CursorPage<T>> => {
    const index = cursor ? Number(cursor.page) : 0;
    return Promise.resolve({
      items: pages[index],
      total_count: pages.flat().length,
      next_cursor: index + 1 < pages.length ? { page: index + 1 } : null,
    });
  };

  it("lê todas as páginas antes do recorte por frente", async () => {
    // Página 1 inteira de COND; a keyword FRANQ só vem na página 3.
    const pages = [[keywords[1]], [keywords[1]], [keywords[0]]];
    const result = await readAllPages(paged(pages));
    expect(result.items).toHaveLength(3);
    expect(result.truncated).toBe(false);
    const rows = buildDetailRows([result.items], [], ancestry);
    expect(sliceByFront(rows, "franchise").items.map((r) => r.item_id)).toEqual(["k1"]);
  });

  it("não corta em silêncio: sinaliza quando o teto de páginas é atingido", async () => {
    const endless = () => Promise.resolve({ items: [keywords[0]], total_count: 1, next_cursor: { page: 1 } });
    const result = await readAllPages(endless);
    expect(result.truncated).toBe(true);
  });
});

describe("10–13. matriz de fontes por canal", () => {
  it("10. Visão geral combina Meta e Google nos grupos, com PMax", () => {
    expect(planFor("group", "all")).toEqual({ entitySources: ["meta_ads", "google_ads"], pmax: "asset_group" });
  });

  it("10b. Visão geral em Anúncios: anúncios Meta + recursos PMax", () => {
    expect(planFor("ad", "all")).toEqual({ entitySources: ["meta_ads"], pmax: "asset" });
  });

  it("10c. Visão geral em Palavras-chave: só Google", () => {
    expect(planFor("keyword", "all")).toEqual({ entitySources: ["google_ads"], pmax: null });
  });

  it("11. Meta Ads exclui Google e PMax em todos os níveis", () => {
    expect(planFor("group", "meta_ads")).toEqual({ entitySources: ["meta_ads"], pmax: null });
    expect(planFor("ad", "meta_ads")).toEqual({ entitySources: ["meta_ads"], pmax: null });
  });

  it("12. Google Ads mostra PMax em Anúncios e em Grupos", () => {
    expect(planFor("ad", "google_ads").pmax).toBe("asset");
    expect(planFor("group", "google_ads")).toEqual({ entitySources: ["google_ads"], pmax: "asset_group" });
  });

  it("13. anúncios tradicionais do Google ficam fora da aba Anúncios", () => {
    expect(planFor("ad", "google_ads").entitySources).toEqual([]);
    expect(planFor("ad", "all").entitySources).not.toContain("google_ads");
  });

  it("leituras auxiliares sobem a árvore só quando necessário", () => {
    expect(lookupsFor("group", planFor("group", "all"))).toEqual([]);
    expect(lookupsFor("keyword", planFor("keyword", "google_ads"))).toEqual([{ source: "google_ads", level: "group" }]);
    expect(lookupsFor("ad", planFor("ad", "meta_ads"))).toEqual([
      { source: "meta_ads", level: "group" }, { source: "meta_ads", level: "campaign" },
    ]);
    // Google em Anúncios só tem PMax, que já traz a campanha.
    expect(lookupsFor("ad", planFor("ad", "google_ads"))).toEqual([]);
  });
});

describe("14–15. abas por canal", () => {
  it("14. Palavras-chave não existe no Meta", () => {
    expect(ids("meta_ads")).toEqual(["campaign", "group", "ad"]);
    expect(labels("meta_ads")).toEqual(["Campanhas", "Conjuntos de anúncios", "Anúncios"]);
  });

  it("15. Palavras-chave existe na Visão geral", () => {
    expect(labels("all")).toEqual(["Campanhas", "Grupos de anúncios", "Anúncios", "Palavras-chave"]);
  });

  it("Google Ads tem as quatro abas", () => {
    expect(labels("google_ads")).toEqual(["Campanhas", "Grupos de anúncios", "Anúncios", "Palavras-chave"]);
  });

  it("nenhuma aba menciona PMax, recursos ou assets", () => {
    (["all", "meta_ads", "google_ads"] as const).forEach((filter) => {
      expect(labels(filter).some((label) => /pmax|performance max|recurso|asset/i.test(label))).toBe(false);
    });
  });

  it("preserva a aba compatível e volta a Campanhas quando não existe", () => {
    expect(resolveLevel("ad", "meta_ads")).toBe("ad");
    expect(resolveLevel("keyword", "all")).toBe("keyword");
    expect(resolveLevel("keyword", "meta_ads")).toBe("campaign");
  });
});

describe("16. nenhum vazamento entre Franquias e Condomínios", () => {
  const everything = buildDetailRows(
    [googleGroups, metaGroups, keywords, metaAds],
    [
      pmax({ level: "asset_group", item_id: "ag-f", asset_group_id: null, asset_group_name: null, field_type: null }),
      pmax({ item_id: "as-c", campaign_id: "c-pmax-cond", campaign_name: COND_CAMPAIGN }),
    ],
    ancestry,
  );

  it("nada de Franquias aparece em Condomínios e vice-versa", () => {
    const franq = new Set(sliceByFront(everything, "franchise").items.map((r) => r.key));
    const cond = new Set(sliceByFront(everything, "condominium").items.map((r) => r.key));
    expect([...franq].filter((key) => cond.has(key))).toEqual([]);
    expect(franq.size + cond.size).toBe(everything.length);
  });

  it("cada item cai exatamente na frente da sua campanha", () => {
    expect(namesIn(everything, "franchise")).toEqual(["a1", "ag-f", "g-franq", "k1", "ms-franq"]);
    expect(namesIn(everything, "condominium")).toEqual(["a2", "a3", "as-c", "g-cond", "k2", "ms-cond"]);
  });
});

describe("chaves e dupla contagem", () => {
  it("o mesmo recurso em dois grupos de recursos vira duas linhas distintas", () => {
    const a = pmaxToRow(pmax({ item_id: "same", asset_group_id: "ag1" }));
    const b = pmaxToRow(pmax({ item_id: "same", asset_group_id: "ag2" }));
    expect(a.key).not.toBe(b.key);
  });

  it("a mesma palavra-chave em dois grupos vira duas linhas distintas", () => {
    const a = entityToRow(e({ level: "keyword", item_id: "same", parent_id: "g1" }));
    const b = entityToRow(e({ level: "keyword", item_id: "same", parent_id: "g2" }));
    expect(a.key).not.toBe(b.key);
  });

  it("a mesclagem é concatenação, nunca soma", () => {
    const rows = buildDetailRows([googleGroups], [pmax({ level: "asset_group" })], ancestry);
    expect(rows.map((r) => r.spend)).toEqual([100, 100, 100]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("recurso PMax preserva tipo e avaliação reais; sem tipo, não inventa", () => {
    expect(pmaxToRow(pmax({})).field_type).toBe("HEADLINE");
    const group = pmaxToRow(pmax({ level: "asset_group", field_type: null, performance_label: null, ad_strength: "GOOD" }));
    expect(group.field_type).toBeNull();
    expect(group.performance_label).toBe("GOOD");
    expect(group.pmax).toBe(true);
  });

  it("campanha Performance Max é reconhecida pelo nome", () => {
    expect(campaignToRow(campaign({ name: "MG | PERFORMANCE MAX | COND" })).pmax).toBe(true);
    expect(campaignToRow(campaign({ name: "MG | SEARCH | FRANQ" })).pmax).toBe(false);
  });
});
