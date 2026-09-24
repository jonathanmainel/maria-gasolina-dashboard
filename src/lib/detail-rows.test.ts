import { describe, expect, it } from "vitest";
import {
  buildDetailRows, campaignToRow, entityToRow, includesPmax, levelsFor, matchesFront, pmaxToRow, resolveLevel, sourcesFor,
  type DetailRow,
} from "./detail-rows";
import type { CampaignRow, EntityItem, PmaxItem } from "../types";

const labels = (filter: Parameters<typeof levelsFor>[0]) => levelsFor(filter).map((o) => o.label);
const ids = (filter: Parameters<typeof levelsFor>[0]) => levelsFor(filter).map((o) => o.id);

const kpis = { has_data: true, spend: 100, impressions: 1000, clicks: 50, results: 5, ctr: 5, cpc: 2, cpm: 100, cost_per_result: 20 };

const entity = (over: Partial<EntityItem> = {}): EntityItem => ({
  ...kpis, level: "group", source: "meta_ads", item_id: "e1", item_name: "Conjunto | FRANQ",
  item_status: "ACTIVE", parent_id: "c1", parent_name: "MG | LEADS | FRANQ", ...over,
});

const asset = (over: Partial<PmaxItem> = {}): PmaxItem => ({
  ...kpis, level: "asset", item_id: "a1", item_name: "Título principal", item_status: "ENABLED",
  campaign_id: "g4", campaign_name: "MG | PERFORMANCE MAX | COND", asset_group_id: "pag1",
  asset_group_name: "Express | COND", field_type: "HEADLINE", performance_label: "BEST",
  text_content: "texto", image_url: null, youtube_video_id: null, ad_strength: null, ...over,
});

const campaign = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: "c1", name: "MG | SEARCH | FRANQ", front: "franchise", channel: "google_ads", objective: "Rede de Pesquisa",
  status: "ACTIVE", spend: 100, impressions: 1000, clicks: 50, leads: 5, cpl: 20, ctr: 5, cpc: 2, ...over,
});

describe("níveis do detalhamento por canal", () => {
  it("Visão geral tem campanhas, grupos e anúncios, com rótulo neutro e sem palavras-chave", () => {
    expect(ids("all")).toEqual(["campaign", "group", "ad"]);
    expect(labels("all")).toEqual(["Campanhas", "Grupos de anúncios", "Anúncios"]);
  });

  it("Meta Ads usa 'Conjuntos de anúncios' e não oferece palavras-chave", () => {
    expect(ids("meta_ads")).toEqual(["campaign", "group", "ad"]);
    expect(labels("meta_ads")).toEqual(["Campanhas", "Conjuntos de anúncios", "Anúncios"]);
  });

  it("Google Ads usa 'Grupos de anúncios' e acrescenta palavras-chave", () => {
    expect(ids("google_ads")).toEqual(["campaign", "group", "ad", "keyword"]);
    expect(labels("google_ads")).toEqual(["Campanhas", "Grupos de anúncios", "Anúncios", "Palavras-chave"]);
  });

  it("nenhum canal expõe abas próprias de Performance Max", () => {
    (["all", "meta_ads", "google_ads"] as const).forEach((filter) => {
      expect(labels(filter).some((label) => /pmax|performance max|recursos/i.test(label))).toBe(false);
    });
  });
});

describe("nível válido ao trocar de canal", () => {
  it("volta para Campanhas quando a aba não existe no novo canal", () => {
    expect(resolveLevel("keyword", "meta_ads")).toBe("campaign");
    expect(resolveLevel("keyword", "all")).toBe("campaign");
  });

  it("preserva a aba quando ela continua existindo", () => {
    expect(resolveLevel("keyword", "google_ads")).toBe("keyword");
    expect(resolveLevel("group", "meta_ads")).toBe("group");
    expect(resolveLevel("ad", "all")).toBe("ad");
    expect(resolveLevel("campaign", "google_ads")).toBe("campaign");
  });
});

describe("quais fontes cada canal consulta", () => {
  it("Visão geral soma os dois canais; os demais consultam só o próprio", () => {
    expect(sourcesFor("all")).toEqual(["meta_ads", "google_ads"]);
    expect(sourcesFor("meta_ads")).toEqual(["meta_ads"]);
    expect(sourcesFor("google_ads")).toEqual(["google_ads"]);
  });
});

describe("onde o Performance Max entra", () => {
  it("entra em grupos e anúncios do Google e da visão combinada", () => {
    expect(includesPmax("group", "google_ads")).toBe(true);
    expect(includesPmax("ad", "google_ads")).toBe(true);
    expect(includesPmax("group", "all")).toBe(true);
    expect(includesPmax("ad", "all")).toBe(true);
  });

  it("nunca entra no Meta, nem em campanhas ou palavras-chave", () => {
    expect(includesPmax("group", "meta_ads")).toBe(false);
    expect(includesPmax("ad", "meta_ads")).toBe(false);
    expect(includesPmax("campaign", "google_ads")).toBe(false);
    expect(includesPmax("keyword", "google_ads")).toBe(false);
  });
});

describe("normalização das linhas", () => {
  it("entidade tradicional não é marcada como PMax e guarda o canal de origem", () => {
    const row = entityToRow(entity());
    expect(row.pmax).toBe(false);
    expect(row.channel).toBe("meta_ads");
    expect(row.subtitle).toBe("MG | LEADS | FRANQ");
  });

  it("recurso PMax é marcado, sempre é Google e preserva o tipo real do backend", () => {
    const row = pmaxToRow(asset());
    expect(row.pmax).toBe(true);
    expect(row.channel).toBe("google_ads");
    expect(row.field_type).toBe("HEADLINE");
    expect(row.performance_label).toBe("BEST");
    expect(row.subtitle).toBe("Express | COND");
  });

  it("grupo de recursos sem tipo não inventa um", () => {
    const row = pmaxToRow(asset({ level: "asset_group", field_type: null, performance_label: null, ad_strength: "GOOD" }));
    expect(row.field_type).toBeNull();
    expect(row.performance_label).toBe("GOOD");
  });

  it("campanha Performance Max é reconhecida pelo nome", () => {
    expect(campaignToRow(campaign({ name: "MG | PERFORMANCE MAX | COND" })).pmax).toBe(true);
    expect(campaignToRow(campaign({ name: "MG | PMAX | FRANQ" })).pmax).toBe(true);
    expect(campaignToRow(campaign({ name: "MG | SEARCH | FRANQ" })).pmax).toBe(false);
  });

  it("campanha vira linha preservando leads e CPL como resultado e custo", () => {
    const row = campaignToRow(campaign({ leads: 42, cpl: 3.5 }));
    expect(row.results).toBe(42);
    expect(row.cost_per_result).toBe(3.5);
  });

  it("chaves não colidem entre canais e entre entidade e PMax de mesmo id", () => {
    const keys = [
      entityToRow(entity({ item_id: "x", source: "meta_ads" })).key,
      entityToRow(entity({ item_id: "x", source: "google_ads" })).key,
      pmaxToRow(asset({ item_id: "x" })).key,
      campaignToRow(campaign({ id: "x" })).key,
    ];
    expect(new Set(keys).size).toBe(4);
  });
});

describe("atribuição de frente no detalhamento", () => {
  const row = (over: Partial<DetailRow>): DetailRow => ({ ...entityToRow(entity()), ...over });

  it("usa o nome do próprio item ou o do pai", () => {
    expect(matchesFront(row({ item_name: "Conjunto FRANQ", subtitle: null }), "franchise")).toBe(true);
    expect(matchesFront(row({ item_name: "Genérico", subtitle: "MG | COND" }), "condominium")).toBe(true);
  });

  it("não força uma frente quando nenhum nome casa", () => {
    const orphan = row({ item_name: "Genérico", subtitle: "MG | MARCA" });
    expect(matchesFront(orphan, "franchise")).toBe(false);
    expect(matchesFront(orphan, "condominium")).toBe(false);
  });
});

describe("mesclagem de entidades tradicionais com Performance Max", () => {
  const traditional = entity({ source: "google_ads", item_id: "gg1", item_name: "Grupo | FRANQ" });
  const assetGroup = asset({
    level: "asset_group", item_id: "pag1", item_name: "Express | FRANQ",
    field_type: null, performance_label: null, ad_strength: "GOOD",
  });

  it("Performance Max entra na mesma lista, marcado, sem aba propria", () => {
    const rows = buildDetailRows([[traditional]], [assetGroup]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.pmax)).toEqual([false, true]);
    expect(rows.every((r) => r.channel === "google_ads")).toBe(true);
  });

  it("grupo de recursos PMax sobrevive ao filtro de frente quando o nome casa", () => {
    const rows = buildDetailRows([[traditional]], [assetGroup]).filter((r) => matchesFront(r, "franchise"));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.pmax)?.item_name).toBe("Express | FRANQ");
  });

  it("recurso PMax de outra frente nao vaza para Franquias", () => {
    const condAsset = asset({ item_id: "pa9", item_name: "Titulo", asset_group_name: "Express | COND" });
    const rows = buildDetailRows([[traditional]], [condAsset]);
    expect(rows.filter((r) => matchesFront(r, "franchise")).map((r) => r.item_id)).toEqual(["gg1"]);
    expect(rows.filter((r) => matchesFront(r, "condominium")).map((r) => r.item_id)).toEqual(["pa9"]);
  });

  it("e concatenacao, nunca soma - a mesclagem nao produz total algum", () => {
    const rows = buildDetailRows([[traditional]], [assetGroup]);
    expect(rows.map((r) => r.spend)).toEqual([traditional.spend, assetGroup.spend]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("Visao geral empilha os dois canais preservando a origem de cada linha", () => {
    const meta = entity({ source: "meta_ads", item_id: "m1", item_name: "Conjunto | FRANQ" });
    const rows = buildDetailRows([[meta], [traditional]], [assetGroup]);
    expect(rows.map((r) => r.channel)).toEqual(["meta_ads", "google_ads", "google_ads"]);
  });

  it("sem Performance Max a lista e so das entidades tradicionais", () => {
    expect(buildDetailRows([[traditional]])).toHaveLength(1);
  });
});
