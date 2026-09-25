import { addDays, format, subDays } from "date-fns";
import type {
  CampaignRow, Channel, Creative, DeliveryStatus, Front, FrontDaily, Goals,
  NetworkCity, NetworkUnitsSnapshot, OrganicDaily, OrganicPost, Platform,
} from "../types";

// Gerador determinístico — os números mudam de forma suave e realista, mas são
// sempre os mesmos entre recargas para a demonstração ser previsível.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_DAYS = 120;
export const demoEnd = subDays(new Date(), 1);
export const demoStart = subDays(demoEnd, DEMO_DAYS - 1);

const iso = (d: Date) => format(d, "yyyy-MM-dd");

interface Profile { spend: number; cpm: number; ctr: number; cvr: number; trend: number }
const profiles: Record<Front, Record<Channel, Profile>> = {
  franchise: {
    meta_ads: { spend: 760, cpm: 14.5, ctr: 1.35, cvr: 5.2, trend: 0.0028 },
    google_ads: { spend: 380, cpm: 78, ctr: 5.6, cvr: 7.8, trend: 0.0016 },
  },
  condominium: {
    meta_ads: { spend: 300, cpm: 11.8, ctr: 1.05, cvr: 4.1, trend: 0.0022 },
    google_ads: { spend: 170, cpm: 62, ctr: 4.9, cvr: 6.3, trend: 0.001 },
  },
};

const weekly = [1.08, 1.12, 1.1, 1.06, 0.98, 0.78, 0.7]; // seg..dom (0 = domingo em getDay, ajustado abaixo)

export const demoFrontDaily: FrontDaily[] = (() => {
  const rows: FrontDaily[] = [];
  const random = rng(20260914);
  for (let i = 0; i < DEMO_DAYS; i += 1) {
    const day = addDays(demoStart, i);
    const dow = (day.getDay() + 6) % 7;
    (["franchise", "condominium"] as Front[]).forEach((front) => {
      (["meta_ads", "google_ads"] as Channel[]).forEach((channel) => {
        const p = profiles[front][channel];
        const growth = 1 + p.trend * i;
        const noise = 0.86 + random() * 0.28;
        const spend = p.spend * weekly[dow] * growth * noise;
        const impressions = Math.round((spend / p.cpm) * 1000 * (0.92 + random() * 0.16));
        const reach = Math.round(impressions * (channel === "meta_ads" ? 0.72 : 0.55));
        const clicks = Math.round(impressions * (p.ctr / 100) * (0.9 + random() * 0.2));
        const leads = Math.round(clicks * (p.cvr / 100) * (0.8 + random() * 0.4));
        rows.push({ date: iso(day), front, channel, spend: Math.round(spend * 100) / 100, impressions, reach, clicks, leads });
      });
    });
  }
  return rows;
})();

const campaignSeed: Array<[Front, Channel, string, string, CampaignRow["status"], number]> = [
  ["franchise", "meta_ads", "MG | LEADS | CBO | FRANQUIA | FORMULÁRIO", "Leads", "ACTIVE", 0.46],
  ["franchise", "meta_ads", "MG | LEADS | CBO | FRANQUIA | POSTS", "Leads", "ACTIVE", 0.3],
  ["franchise", "meta_ads", "MG | LEADS | LOOKALIKE 2% | FRANQUIA", "Leads", "LEARNING", 0.16],
  ["franchise", "meta_ads", "MG | RMKT | FRANQUIA | DISCOVERY DAY", "Remarketing", "ACTIVE", 0.08],
  ["franchise", "google_ads", "MG | SEARCH | MAX.CONV | FRANQUIA", "Search", "ACTIVE", 0.58],
  ["franchise", "google_ads", "MG | SEARCH | MARCA | MARIA GASOLINA", "Search", "ACTIVE", 0.22],
  ["franchise", "google_ads", "MG | PERFORMANCE MAX | FRANQUIA", "PMax", "ACTIVE", 0.2],
  ["condominium", "meta_ads", "MG | LEADS | CBO | CONDOMÍNIOS | SÍNDICOS", "Leads", "ACTIVE", 0.52],
  ["condominium", "meta_ads", "MG | LEADS | CONDOMÍNIOS | CAPITAIS", "Leads", "ACTIVE", 0.33],
  ["condominium", "meta_ads", "MG | RMKT | CONDOMÍNIOS | INDICAÇÃO", "Remarketing", "PAUSED", 0.15],
  ["condominium", "google_ads", "MG | SEARCH | MAX.CONV | CONDOMÍNIOS", "Search", "ACTIVE", 0.64],
  ["condominium", "google_ads", "MG | SEARCH | INDICAÇÃO DE SÍNDICOS", "Search", "ACTIVE", 0.36],
];

export function demoCampaigns(daily: FrontDaily[]): CampaignRow[] {
  const random = rng(77);
  return campaignSeed.map(([front, channel, name, objective, status, share], index) => {
    const rows = daily.filter((r) => r.front === front && r.channel === channel);
    const t = rows.reduce((acc, r) => ({ spend: acc.spend + r.spend, impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, leads: acc.leads + r.leads }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });
    const jitter = 0.85 + random() * 0.3;
    const spend = t.spend * share;
    const impressions = Math.round(t.impressions * share * jitter);
    const clicks = Math.round(t.clicks * share * jitter);
    const leads = Math.round(t.leads * share * (objective === "Remarketing" ? 1.4 : jitter));
    return {
      id: `c${index + 1}`, name, front, channel, objective, status,
      spend: Math.round(spend * 100) / 100, impressions, clicks, leads,
      cpl: leads ? spend / leads : null, ctr: impressions ? (clicks * 100) / impressions : null, cpc: clicks ? spend / clicks : null,
    };
  });
}

const creativeSeed: Array<[Front, Channel, Creative["format"], string, string, [string, string], number, number]> = [
  ["franchise", "meta_ads", "video", "Vídeo | Mercado no condomínio", "Uma loja que fatura enquanto você dorme", ["#9d2a1e", "#d7982b"], 0.3, 4.8],
  ["franchise", "meta_ads", "carousel", "Carrossel | 5 motivos para franquear", "Investimento a partir de R$ 80 mil", ["#324552", "#9d2a1e"], 0.22, 0],
  ["franchise", "meta_ads", "image", "Estático | Seja um franqueado", "130+ unidades. A próxima pode ser sua.", ["#1f2d36", "#d7982b"], 0.18, 0],
  ["franchise", "meta_ads", "video", "Vídeo | Depoimento franqueado Campinas", "\"Paguei o investimento em 14 meses\"", ["#7a1f16", "#324552"], 0.2, 5.6],
  ["franchise", "meta_ads", "image", "Estático | Discovery Day", "Conheça a operação por dentro nesta semana", ["#d7982b", "#324552"], 0.1, 0],
  ["franchise", "google_ads", "image", "RSA | Franquia de conveniência", "Franquia de mercado autônomo em condomínio", ["#324552", "#243842"], 0.6, 0],
  ["franchise", "google_ads", "image", "RSA | Marca", "Maria Gasolina Express | Site oficial", ["#9d2a1e", "#324552"], 0.4, 0],
  ["condominium", "meta_ads", "video", "Vídeo | Seu condomínio completo", "Mercado 24h sem custo para o condomínio", ["#324552", "#d7982b"], 0.42, 4.1],
  ["condominium", "meta_ads", "image", "Estático | Indique seu condomínio", "Síndico: valorize o seu condomínio", ["#9d2a1e", "#1f2d36"], 0.33, 0],
  ["condominium", "meta_ads", "carousel", "Carrossel | Como funciona a instalação", "Container climatizado em 30 dias", ["#d7982b", "#9d2a1e"], 0.25, 0],
  ["condominium", "google_ads", "image", "RSA | Mercado em condomínio", "Minimercado autônomo para condomínios", ["#243842", "#9d2a1e"], 1, 0],
];

export function demoCreatives(daily: FrontDaily[]): Creative[] {
  const random = rng(31);
  return creativeSeed.map(([front, channel, fmt, name, headline, palette, share, hook], index) => {
    const rows = daily.filter((r) => r.front === front && r.channel === channel);
    const t = rows.reduce((acc, r) => ({ spend: acc.spend + r.spend, impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, leads: acc.leads + r.leads }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });
    const q = 0.75 + random() * 0.5;
    const spend = t.spend * share;
    const impressions = Math.round(t.impressions * share);
    const clicks = Math.round(t.clicks * share * q);
    const leads = Math.round(t.leads * share * q);
    return {
      id: `cr${index + 1}`, name, front, channel, format: fmt, headline, palette,
      spend: Math.round(spend * 100) / 100, impressions, clicks, leads,
      cpl: leads ? spend / leads : null, ctr: impressions ? (clicks * 100) / impressions : null, hook_rate: hook ? hook * (0.9 + random() * 0.2) : null,
    };
  });
}

// --- Orgânico -----------------------------------------------------------------

export const demoOrganicDaily: OrganicDaily[] = (() => {
  const rows: OrganicDaily[] = [];
  const random = rng(4242);
  let ig = 18420;
  let fb = 6210;
  for (let i = 0; i < DEMO_DAYS; i += 1) {
    const day = addDays(demoStart, i);
    const dow = (day.getDay() + 6) % 7;
    const postDay = dow < 5 && i % 3 !== 1; // ~20 posts/mês
    const storyDay = dow < 6;
    const boost = i > DEMO_DAYS - 45 ? 1.55 : 1; // entrada da GT+
    const igNew = Math.round((22 + random() * 30) * boost * (postDay ? 1.3 : 0.8));
    const igUn = Math.round(4 + random() * 7);
    ig += igNew - igUn;
    const fbNew = Math.round((6 + random() * 9) * boost);
    const fbUn = Math.round(1 + random() * 3);
    fb += fbNew - fbUn;
    const igReach = Math.round((3800 + random() * 2600) * boost * (postDay ? 1.4 : 0.7));
    const fbReach = Math.round((900 + random() * 700) * boost * (postDay ? 1.2 : 0.8));
    rows.push({
      date: iso(day), platform: "instagram", followers: ig, new_followers: igNew, unfollows: igUn,
      reach: igReach, impressions: Math.round(igReach * 1.6), likes: Math.round(igReach * 0.055 * (0.8 + random() * 0.4)),
      comments: Math.round(igReach * 0.004 * (0.6 + random() * 0.8)), shares: Math.round(igReach * 0.006), saves: Math.round(igReach * 0.009),
      dms: Math.round(3 + random() * 9 * boost), profile_visits: Math.round(igReach * 0.03),
      posts: postDay ? 1 : 0, stories: storyDay ? Math.round(1 + random() * 1.4) : 0,
    });
    rows.push({
      date: iso(day), platform: "facebook", followers: fb, new_followers: fbNew, unfollows: fbUn,
      reach: fbReach, impressions: Math.round(fbReach * 1.4), likes: Math.round(fbReach * 0.03 * (0.8 + random() * 0.4)),
      comments: Math.round(fbReach * 0.003), shares: Math.round(fbReach * 0.008), saves: Math.round(fbReach * 0.002),
      dms: Math.round(1 + random() * 3), profile_visits: Math.round(fbReach * 0.02),
      posts: postDay ? 1 : 0, stories: storyDay ? 1 : 0,
    });
  }
  return rows;
})();

const postSeed: Array<[Platform, OrganicPost["format"], string, [string, string], number]> = [
  ["instagram", "reel", "Bastidores da inauguração em Valinhos: 48h para montar uma loja completa dentro do condomínio 🏗️", ["#9d2a1e", "#d7982b"], 1],
  ["instagram", "carousel", "5 números que explicam por que síndicos estão pedindo uma Maria Gasolina no condomínio", ["#324552", "#d7982b"], 0.72],
  ["instagram", "reel", "Franqueado Campinas conta como recuperou o investimento em 14 meses", ["#243842", "#9d2a1e"], 0.64],
  ["instagram", "image", "Pão fresco 2x ao dia. Café Nescafé. Chopp gelado. Tudo a 40 passos da sua porta.", ["#d7982b", "#324552"], 0.41],
  ["instagram", "reel", "Tour pela loja modelo: 1.200 itens em 18 m²", ["#1f2d36", "#d7982b"], 0.55],
  ["facebook", "image", "Maria Gasolina Express chega a Curitiba com duas novas unidades", ["#324552", "#9d2a1e"], 0.38],
  ["instagram", "carousel", "Discovery Day desta semana: agenda aberta para candidatos a franqueado", ["#9d2a1e", "#324552"], 0.33],
  ["facebook", "reel", "Como funciona o autoatendimento 24h (sem funcionário, sem filas)", ["#d7982b", "#243842"], 0.3],
  ["instagram", "image", "Prêmio Excelência em Franchising 2026 🏆 obrigado, rede!", ["#7a1f16", "#d7982b"], 0.6],
  ["instagram", "reel", "3 erros que todo síndico comete ao escolher um mercado autônomo", ["#324552", "#1f2d36"], 0.47],
];

export const demoOrganicPosts: OrganicPost[] = (() => {
  const random = rng(99);
  return postSeed.map(([platform, fmt, caption, palette, weight], index) => {
    const reach = Math.round((platform === "instagram" ? 14000 : 4200) * weight * (0.85 + random() * 0.3));
    const likes = Math.round(reach * (fmt === "reel" ? 0.071 : 0.052) * (0.9 + random() * 0.2));
    const comments = Math.round(reach * 0.0045 * (0.7 + random() * 0.6));
    const shares = Math.round(reach * (fmt === "reel" ? 0.012 : 0.006));
    const saves = Math.round(reach * (fmt === "carousel" ? 0.018 : 0.008));
    const daysAgo = 2 + Math.round(random() * 40);
    return {
      id: `p${index + 1}`, platform, format: fmt, caption, palette, reach, likes, comments, shares, saves,
      engagement_rate: ((likes + comments + shares + saves) * 100) / reach,
      published_at: iso(subDays(demoEnd, daysAgo)),
    };
  });
})();

export const demoGoals: Goals = {
  media_budget: 50000,
  leads_franchise: 420,
  leads_condominium: 180,
  cpl_franchise: 65,
  cpl_condominium: 85,
  posts: 20,
  stories: 20,
  followers_growth: 1200,
  contracts_franchise: 6,
  contracts_condominium: 8,
};

export const demoDelivery: DeliveryStatus = {
  posts_published: 14,
  stories_published: 17,
  reels_published: 9,
  carousel_published: 6,
  instant_published: 4,
};

// ---------------------------------------------------------------------------
// Base de unidades no modo demonstração (`?demo=1`)
//
// A RPC `get_dashboard_network_units` exige sessão autenticada, e o modo
// demonstração roda sem login. Este recorte existe só para o mapa ter o que
// desenhar nessa visita — nunca é usado como fallback de erro da RPC real, e
// não entra no build publicado (ver `isDemoMode` em `lib/api.ts`).
//
// As coordenadas são as dos municípios de verdade, para o recorte cair no lugar
// certo do território; os volumes é que são ilustrativos.
// ---------------------------------------------------------------------------

const demoCityRows: Array<[string, string, number, number, number]> = [
  ["Campinas", "SP", 12, -22.9099, -47.0626],
  ["São Paulo", "SP", 9, -23.5505, -46.6333],
  ["Jundiaí", "SP", 4, -23.1857, -46.8978],
  ["Indaiatuba", "SP", 3, -23.0816, -47.2101],
  ["Ribeirão Preto", "SP", 3, -21.1775, -47.8103],
  ["Curitiba", "PR", 3, -25.4284, -49.2733],
  ["Belo Horizonte", "MG", 2, -19.9167, -43.9345],
  ["Rio de Janeiro", "RJ", 2, -22.9068, -43.1729],
  ["Porto Alegre", "RS", 1, -30.0346, -51.2177],
  ["Brasília", "DF", 1, -15.7939, -47.8828],
];

const demoNetworkCities: NetworkCity[] = demoCityRows.map(([city, state, units, latitude, longitude]) => ({
  city,
  state,
  normalized_city: city.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase(),
  unit_count: units,
  resolved: true,
  municipality_ibge_code: null,
  latitude,
  longitude,
}));

export const demoNetworkUnits: NetworkUnitsSnapshot = {
  units: [],
  cities: demoNetworkCities,
  summary: {
    total_units: demoNetworkCities.reduce((sum, city) => sum + city.unit_count, 0),
    total_cities: demoNetworkCities.length,
    unresolved_cities: 0,
    last_import_at: iso(demoEnd),
    last_import: {
      id: 0,
      filename: "base-demonstracao.xlsx",
      status: "success",
      total_rows: demoNetworkCities.reduce((sum, city) => sum + city.unit_count, 0),
      valid_rows: demoNetworkCities.reduce((sum, city) => sum + city.unit_count, 0),
      duplicate_rows: 0,
      invalid_rows: 0,
      unresolved_cities: 0,
      created_at: iso(demoEnd),
      completed_at: iso(demoEnd),
    },
  },
  headquarters: { city: "Campinas", state: "SP" },
};
