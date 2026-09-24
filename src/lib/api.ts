import type { AnalyticsAcquisitionItem, AnalyticsEventItem, AnalyticsKpis, CursorPage, DateRange, EntityItem, EntityLevel, OverviewResponse, PmaxItem, PmaxLevel, Source } from "../types";
import { mockAnalyticsAcquisition, mockAnalyticsEvents, mockEntities, mockOverview, mockPmax } from "../data/mock";
import { supabase } from "./supabase";

export const CLIENT_SLUG = "maria-gasolina";

// Guardado contra ausência de `window` para o módulo poder ser importado fora do
// navegador (testes unitários, ferramentas de build).
export const isDemoMode =
  (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "1") &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("demo") === "1";

const delay = (ms = 260) => new Promise((resolve) => window.setTimeout(resolve, ms));

export async function getOverview(range: DateRange): Promise<OverviewResponse> {
  if (isDemoMode) {
    await delay();
    return { ...mockOverview, period: { ...mockOverview.period, ...range } };
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_overview", {
    p_client_slug: CLIENT_SLUG,
    p_start_date: range.start,
    p_end_date: range.end,
  });
  if (error) throw error;
  return data as OverviewResponse;
}

type Cursor = Record<string, string | number> | null;

// As RPCs de leitura limitam cada página a 100 itens.
const RPC_PAGE_SIZE = 100;
// Teto de segurança contra cursor que nunca termina: 200 páginas = 20 mil itens.
const MAX_PAGES = 200;

export interface AllItems<T> {
  items: T[];
  /** Verdadeiro só se o teto de páginas foi atingido — nunca corta em silêncio. */
  truncated: boolean;
}

/**
 * Percorre o cursor até o fim. O recorte por frente acontece depois da leitura,
 * então buscar só a primeira página descartaria entidades válidas que estão nas
 * páginas seguintes (ordenadas por investimento).
 */
export async function readAllPages<T>(fetchPage: (cursor: Cursor) => Promise<CursorPage<T>>): Promise<AllItems<T>> {
  const items: T[] = [];
  let cursor: Cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    if (!result.next_cursor) return { items, truncated: false };
    cursor = result.next_cursor;
  }
  return { items, truncated: true };
}

export async function getEntities(source: Source, level: EntityLevel, range: DateRange, cursor: Cursor = null): Promise<CursorPage<EntityItem>> {
  if (isDemoMode) {
    await delay();
    return mockEntities[`${source === "google_ads" ? "google" : "meta"}_${level}`] ?? { items: [], total_count: 0, next_cursor: null };
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_entities", {
    p_client_slug: CLIENT_SLUG,
    p_source: source,
    p_level: level,
    p_start_date: range.start,
    p_end_date: range.end,
    p_limit: RPC_PAGE_SIZE,
    p_cursor: cursor,
  });
  if (error) throw error;
  return data as CursorPage<EntityItem>;
}

export async function getPmax(level: PmaxLevel, range: DateRange, cursor: Cursor = null): Promise<CursorPage<PmaxItem>> {
  if (isDemoMode) {
    await delay();
    return mockPmax[level];
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_pmax", {
    p_client_slug: CLIENT_SLUG,
    p_start_date: range.start,
    p_end_date: range.end,
    p_level: level,
    p_limit: RPC_PAGE_SIZE,
    p_cursor: cursor,
  });
  if (error) throw error;
  return data as CursorPage<PmaxItem>;
}

export const getAllEntities = (source: Source, level: EntityLevel, range: DateRange) =>
  readAllPages((cursor) => getEntities(source, level, range, cursor));

export const getAllPmax = (level: PmaxLevel, range: DateRange) =>
  readAllPages((cursor) => getPmax(level, range, cursor));

function mockPage<T>(items: T[], cursor: Record<string, string | number> | null, limit: number): CursorPage<T> {
  const offset = Number(cursor?.offset ?? 0);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return { items: page, total_count: items.length, next_cursor: nextOffset < items.length ? { offset: nextOffset } : null };
}

export async function getAnalyticsAcquisition(
  range: DateRange,
  cursor: Record<string, string | number> | null = null,
  limit = 10,
): Promise<CursorPage<AnalyticsAcquisitionItem>> {
  if (isDemoMode) {
    await delay();
    return mockPage(mockAnalyticsAcquisition, cursor, limit);
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_ga4_acquisition", {
    p_client_slug: CLIENT_SLUG,
    p_start_date: range.start,
    p_end_date: range.end,
    p_limit: limit,
    p_cursor: cursor,
  });
  if (error) throw error;
  return data as CursorPage<AnalyticsAcquisitionItem>;
}

export async function getAnalyticsEvents(
  range: DateRange,
  cursor: Record<string, string | number> | null = null,
  limit = 10,
): Promise<CursorPage<AnalyticsEventItem>> {
  if (isDemoMode) {
    await delay();
    return mockPage(mockAnalyticsEvents, cursor, limit);
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");
  const { data, error } = await supabase.rpc("get_dashboard_ga4_events", {
    p_client_slug: CLIENT_SLUG,
    p_start_date: range.start,
    p_end_date: range.end,
    p_limit: limit,
    p_cursor: cursor,
  });
  if (error) throw error;
  return data as CursorPage<AnalyticsEventItem>;
}

// ---------------------------------------------------------------------------
// v2 — frentes (Meta Ads + Google Ads), orgânico e GA4.
//
// As frentes são lidas direto das tabelas de ingestão (`dashboard_campaign_daily`
// e `dashboard_ad_daily`), que já têm política de SELECT para membros do cliente.
// A leitura é feita em nível diário porque as RPCs de leitura existentes
// (`get_dashboard_entities`) entregam totais agregados do período, e não a série
// por dia que os gráficos de evolução precisam. Nenhuma RPC nova foi criada.
//
// A frente (franquias x condomínios) não existe no banco: ela vem do padrão de
// nomenclatura das campanhas ("MG | ... | FRANQUIA | ..."). O que não casa com
// nenhum dos dois padrões é somado em `unclassified` e declarado na interface,
// em vez de ser jogado numa frente arbitrária ou descartado em silêncio.
// ---------------------------------------------------------------------------
import { demoCampaigns, demoCreatives, demoFrontDaily, demoOrganicDaily, demoOrganicPosts } from "../data/demo";
import { previousRange } from "./metrics";
import type { CampaignRow, Channel, Creative, Front, FrontDaily, OrganicDaily, OrganicPost } from "../types";

export interface UnclassifiedSpend {
  campaigns: string[];
  spend: number;
  leads: number;
}

export interface FrontBundle {
  daily: FrontDaily[];
  campaigns: CampaignRow[];
  creatives: Creative[];
  unclassified: UnclassifiedSpend;
  origin: "supabase" | "demo";
}

const FRANCHISE_PATTERN = /franq/i;
const CONDOMINIUM_PATTERN = /cond/i;

export function classifyFront(name: string | null | undefined): Front | null {
  const value = name ?? "";
  if (FRANCHISE_PATTERN.test(value)) return "franchise";
  if (CONDOMINIUM_PATTERN.test(value)) return "condominium";
  return null;
}

const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalizeStatus(status: string | null | undefined): CampaignRow["status"] {
  const value = (status ?? "").toUpperCase();
  if (value === "ACTIVE" || value === "ENABLED") return "ACTIVE";
  if (value === "PAUSED") return "PAUSED";
  if (value === "REMOVED" || value === "DELETED" || value === "ARCHIVED") return "REMOVED";
  if (value === "LEARNING") return "LEARNING";
  return "PAUSED";
}

/** Objetivo textual da campanha, inferido do nome — o banco não guarda esse campo. */
function inferObjective(name: string, channel: Channel): string {
  const value = name.toUpperCase();
  if (/RMKT|REMARKETING|RETARGET/.test(value)) return "Remarketing";
  if (/PERFORMANCE ?MAX|PMAX/.test(value)) return "Performance Max";
  if (/SEARCH|PESQUISA/.test(value)) return "Rede de Pesquisa";
  if (/DISPLAY/.test(value)) return "Display";
  if (/LEAD|FORMUL/.test(value)) return "Leads";
  return channel === "google_ads" ? "Google Ads" : "Meta Ads";
}

function inferFormat(name: string): Creative["format"] {
  const value = name.toUpperCase();
  if (/V[IÍ]DEO|VIDEO|REEL|VSL/.test(value)) return "video";
  if (/CARROSSEL|CAROUSEL|CARD/.test(value)) return "carousel";
  return "image";
}

/** Paleta determinística da marca, para o card do criativo não trocar de cor a cada render. */
const palettes: Array<[string, string]> = [
  ["#9d2a1e", "#d7982b"], ["#324552", "#9d2a1e"], ["#1f2d36", "#d7982b"],
  ["#7a1f16", "#324552"], ["#d7982b", "#324552"], ["#243842", "#9d2a1e"],
];
function paletteFor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length];
}

const PAGE_SIZE = 1000;

/** Lê uma tabela inteira em páginas — o PostgREST corta a resposta em 1000 linhas. */
async function fetchAllRows<T>(
  table: string,
  columns: string,
  apply: (query: ReturnType<ReturnType<NonNullable<typeof supabase>["from"]>["select"]>) => typeof query,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await apply(supabase!.from(table).select(columns)).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

let clientIdCache: Promise<number> | null = null;

/** Resolve o id do cliente uma única vez por sessão; um erro limpa o cache para permitir nova tentativa. */
export function getClientId(): Promise<number> {
  if (!supabase) return Promise.reject(new Error("A conexão com o Supabase ainda não foi configurada."));
  if (clientIdCache) return clientIdCache;
  const pending: Promise<number> = (async () => {
    const { data, error } = await supabase!.from("dashboard_clients").select("id").eq("slug", CLIENT_SLUG).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Cliente "${CLIENT_SLUG}" não encontrado ou sem permissão de acesso.`);
    return data.id as number;
  })();
  clientIdCache = pending;
  pending.catch(() => { clientIdCache = null; });
  return pending;
}

interface CampaignDailyRow {
  source: Channel; campaign_id: string; campaign_name: string | null; campaign_status: string | null;
  metric_date: string; impressions: number | null; reach: number | null; clicks: number | null;
  link_clicks: number | null; conversions: number | null; spend: number | null;
}

interface AdDailyRow {
  source: Channel; ad_id: string; ad_name: string | null; campaign_name: string | null;
  impressions: number | null; clicks: number | null; conversions: number | null; spend: number | null;
}

function demoBundle(range: DateRange): FrontBundle {
  const inPeriod = demoFrontDaily.filter((r) => r.date >= range.start && r.date <= range.end);
  return {
    daily: demoFrontDaily,
    campaigns: demoCampaigns(inPeriod),
    creatives: demoCreatives(inPeriod),
    unclassified: { campaigns: [], spend: 0, leads: 0 },
    origin: "demo",
  };
}

export async function getFrontData(range: DateRange): Promise<FrontBundle> {
  if (isDemoMode) {
    await delay(180);
    return demoBundle(range);
  }
  if (!supabase) throw new Error("A conexão com o Supabase ainda não foi configurada.");

  const previous = previousRange(range);
  const clientId = await getClientId();

  // Período atual + período de comparação numa leitura só: os cards, o gráfico e
  // os deltas ficam sempre no mesmo intervalo, sem uma segunda requisição que
  // possa chegar fora de ordem.
  const [campaignRows, adRows] = await Promise.all([
    fetchAllRows<CampaignDailyRow>(
      "dashboard_campaign_daily",
      "source,campaign_id,campaign_name,campaign_status,metric_date,impressions,reach,clicks,link_clicks,conversions,spend",
      (query) => query.eq("client_id", clientId).gte("metric_date", previous.start).lte("metric_date", range.end),
    ),
    fetchAllRows<AdDailyRow>(
      "dashboard_ad_daily",
      "source,ad_id,ad_name,campaign_name,impressions,clicks,conversions,spend",
      (query) => query.eq("client_id", clientId).gte("metric_date", range.start).lte("metric_date", range.end),
    ),
  ]);

  // --- série diária por frente e canal ---
  const dailyMap = new Map<string, FrontDaily>();
  const unclassifiedNames = new Set<string>();
  let unclassifiedSpend = 0;
  let unclassifiedLeads = 0;

  campaignRows.forEach((row) => {
    const front = classifyFront(row.campaign_name ?? row.campaign_id);
    if (!front) {
      if (row.metric_date >= range.start && row.metric_date <= range.end) {
        unclassifiedNames.add(row.campaign_name ?? row.campaign_id);
        unclassifiedSpend += num(row.spend);
        unclassifiedLeads += num(row.conversions);
      }
      return;
    }
    const key = `${row.metric_date}|${front}|${row.source}`;
    const entry = dailyMap.get(key)
      ?? { date: row.metric_date, front, channel: row.source, spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0 };
    entry.spend += num(row.spend);
    entry.impressions += num(row.impressions);
    entry.reach += num(row.reach);
    entry.clicks += num(row.clicks);
    entry.leads += num(row.conversions);
    dailyMap.set(key, entry);
  });

  // --- campanhas agregadas no período atual ---
  const campaignMap = new Map<string, CampaignRow>();
  campaignRows
    .filter((row) => row.metric_date >= range.start && row.metric_date <= range.end)
    .forEach((row) => {
      const front = classifyFront(row.campaign_name ?? row.campaign_id);
      if (!front) return;
      const name = row.campaign_name ?? row.campaign_id;
      const entry = campaignMap.get(row.campaign_id) ?? {
        id: row.campaign_id, name, front, channel: row.source,
        objective: inferObjective(name, row.source), status: normalizeStatus(row.campaign_status),
        spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: null, ctr: null, cpc: null,
      };
      entry.spend += num(row.spend);
      entry.impressions += num(row.impressions);
      entry.clicks += num(row.clicks);
      entry.leads += num(row.conversions);
      campaignMap.set(row.campaign_id, entry);
    });

  const campaigns = [...campaignMap.values()].map((campaign) => ({
    ...campaign,
    cpl: campaign.leads > 0 ? campaign.spend / campaign.leads : null,
    ctr: campaign.impressions > 0 ? (campaign.clicks * 100) / campaign.impressions : null,
    cpc: campaign.clicks > 0 ? campaign.spend / campaign.clicks : null,
  }));

  // --- criativos (anúncios) agregados no período atual ---
  const creativeMap = new Map<string, Creative>();
  adRows.forEach((row) => {
    const front = classifyFront(row.campaign_name ?? row.ad_name);
    if (!front) return;
    const name = row.ad_name ?? row.ad_id;
    const entry = creativeMap.get(row.ad_id) ?? {
      id: row.ad_id, name, front, channel: row.source, format: inferFormat(name),
      headline: row.campaign_name ?? name, palette: paletteFor(row.ad_id),
      spend: 0, impressions: 0, clicks: 0, leads: 0, cpl: null, ctr: null, hook_rate: null,
    };
    entry.spend += num(row.spend);
    entry.impressions += num(row.impressions);
    entry.clicks += num(row.clicks);
    entry.leads += num(row.conversions);
    creativeMap.set(row.ad_id, entry);
  });

  const creatives = [...creativeMap.values()].map((creative) => ({
    ...creative,
    cpl: creative.leads > 0 ? creative.spend / creative.leads : null,
    ctr: creative.impressions > 0 ? (creative.clicks * 100) / creative.impressions : null,
  }));

  return {
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    campaigns,
    creatives,
    unclassified: { campaigns: [...unclassifiedNames], spend: unclassifiedSpend, leads: unclassifiedLeads },
    origin: "supabase",
  };
}

export interface OrganicBundle {
  daily: OrganicDaily[];
  posts: OrganicPost[];
  origin: "supabase" | "demo";
}

/**
 * Instagram e Facebook orgânicos ainda não têm ingestão: não existe tabela nem
 * RPC para eles no backend. A tela continua de pé com o gerador de demonstração
 * e um aviso explícito na interface, como manda a direção visual do projeto.
 */
export async function getOrganic(range: DateRange): Promise<OrganicBundle> {
  await delay(160);
  return {
    daily: demoOrganicDaily,
    posts: demoOrganicPosts.filter((post) => post.published_at >= range.start && post.published_at <= range.end),
    origin: "demo",
  };
}

export interface Ga4Bundle {
  current: AnalyticsKpis | null;
  previous: AnalyticsKpis | null;
  acquisition: AnalyticsAcquisitionItem[];
  events: AnalyticsEventItem[];
  origin: "supabase" | "demo";
}

/** GA4 vem das RPCs de leitura que já existiam no banco — nada novo foi criado. */
export async function getGa4(range: DateRange): Promise<Ga4Bundle> {
  const [overview, acquisition, events] = await Promise.all([
    getOverview(range),
    getAnalyticsAcquisition(range, null, 25),
    getAnalyticsEvents(range, null, 25),
  ]);
  return {
    current: overview.analytics?.current ?? null,
    previous: overview.analytics?.previous ?? null,
    acquisition: acquisition.items,
    events: events.items,
    origin: isDemoMode ? "demo" : "supabase",
  };
}

/** Último sync bem-sucedido de qualquer fonte, para a pílula "Atualizado" da topbar. */
export async function getLastSync(): Promise<string | null> {
  if (isDemoMode) return new Date(Date.now() - 1000 * 60 * 47).toISOString();
  if (!supabase) return null;
  const clientId = await getClientId();
  const { data, error } = await supabase
    .from("dashboard_sync_runs")
    .select("completed_at")
    .eq("client_id", clientId)
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.completed_at as string | undefined) ?? null;
}
