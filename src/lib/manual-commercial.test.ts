// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoManualData, loadManualData, normalize, saveManualData } from "./manual-inputs";
const state = vi.hoisted(() => ({ demo: false, remote: false, ready: false, role: "viewer", writeResponse: "expected", writeError: null as null | {code:string;message:string}, payload: null as unknown, writes: [] as Array<Record<string, unknown>>, filters: [] as unknown[] }));
vi.mock("./api", () => ({ CLIENT_SLUG: "maria-gasolina", get isDemoMode() { return state.demo; } }));
vi.mock("./commercial-access", () => ({ loadCommercialAccess: async () => ({
  role:state.role, policyReady:state.ready, canEdit:state.ready && ["editor","admin"].includes(state.role), clientId:1,userId:"test-author",
}) }));
vi.mock("./supabase", () => {
  const client = { from(table: string) {
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { state.filters.push([table, key, value]); return chain; },
      maybeSingle: async () => ({ data: table === "dashboard_clients" ? { id: 1 } : state.payload == null ? null : { payload: state.payload }, error: null }),
      upsert: (value: Record<string, unknown>) => { state.writes.push(value); return { select: async (columns: string) => {
        state.filters.push(["returning", columns]);
        if (state.writeError) return { data: null, error: state.writeError };
        if (state.writeResponse === "empty") return { data: [], error: null };
        if (state.writeResponse === "null") return { data: null, error: null };
        const returned = structuredClone(value);
        if (state.writeResponse === "client") returned.client_id = 2;
        if (state.writeResponse === "scope") returned.scope = "crm_snap_company";
        if (state.writeResponse === "payload") (returned.payload as any).goals.media_budget += 1;
        return { data: state.writeResponse === "multiple" ? [returned, returned] : [returned], error: null };
      } }; },
    };
    return chain;
  } };
  return { get supabase() { return state.remote ? client : null; } };
});
const legacyKey = "mg-dashboard-manual-v1";
const settingsKey = "mg-dashboard-settings-v2:maria-gasolina";
const demoKey = "mg-dashboard-demo-v1:maria-gasolina";
const legacy = { ...demoManualData, goals: { ...demoManualData.goals, media_budget: 12345 }, delivery: { ...demoManualData.delivery, posts_published: 8 } };
const ownedKeys = [legacyKey, settingsKey, demoKey, "mg-dashboard-theme", "sb-test-auth-token", "other-client-cache"];
beforeEach(() => { state.demo = false; state.remote = false; state.ready=false; state.role="viewer"; state.writeResponse="expected"; state.writeError=null; state.payload = null; state.writes = []; state.filters = []; });
afterEach(() => { for (const key of ownedKeys) localStorage.removeItem(key); });

describe("limpeza e invalidacao comercial limitada a Maria Gasolina", () => {
  it("ausencia total nao recebe dados comerciais nem zeros", () => {
    const data = normalize(undefined);
    expect(data.funnel).toEqual({ franchise: null, condominium: null });
    expect(data.results).toEqual({ franchise: null, condominium: null });
    expect(data.goals).toEqual(demoManualData.goals);
  });
  it("legado comercial e ignorado, preservando configuracoes e o original recuperavel", async () => {
    const raw = JSON.stringify(legacy); localStorage.setItem(legacyKey, raw);
    localStorage.setItem("mg-dashboard-theme", "light"); localStorage.setItem("sb-test-auth-token", "sessao-teste"); localStorage.setItem("other-client-cache", "preservado");
    const result = await loadManualData();
    expect(result.data.funnel.franchise).toBeNull(); expect(result.data.results.condominium).toBeNull();
    expect(result.data.goals.media_budget).toBe(12345); expect(result.data.delivery.posts_published).toBe(8);
    expect(localStorage.getItem(legacyKey)).toBe(raw);
    expect(localStorage.getItem("mg-dashboard-theme")).toBe("light"); expect(localStorage.getItem("sb-test-auth-token")).toBe("sessao-teste"); expect(localStorage.getItem("other-client-cache")).toBe("preservado");
  });
  it("salvar metas nao reintroduz comercio no novo cache nem altera a chave legada", async () => {
    const raw = JSON.stringify(legacy); localStorage.setItem(legacyKey, raw);
    state.remote=true; state.ready=true; state.role="editor";
    await saveManualData(legacy);
    const saved = JSON.parse(localStorage.getItem(settingsKey)!);
    expect(saved).not.toHaveProperty("funnel"); expect(saved).not.toHaveProperty("results");
    expect(saved.goals).toEqual(legacy.goals); expect(saved.delivery).toEqual(legacy.delivery);
    expect(localStorage.getItem(legacyKey)).toBe(raw);
    expect((await loadManualData()).data.results.franchise).toBeNull();
  });
  it("modo demo usa exemplos e cache proprio; operacao nao herda o que foi editado nele", async () => {
    state.demo = true;
    expect((await loadManualData()).data.results).toEqual(demoManualData.results);
    await saveManualData(legacy);
    expect(localStorage.getItem(demoKey)).not.toBeNull(); expect(localStorage.getItem(settingsKey)).toBeNull();
    state.demo = false;
    const result = await loadManualData();
    expect(result.data.results.franchise).toBeNull(); expect(result.data.funnel.condominium).toBeNull();
  });
  it("registro remoto ausente nao fabrica comercio nem realiza escrita de inicializacao", async () => {
    state.remote = true;
    const result = await loadManualData();
    expect(result.data.results.franchise).toBeNull(); expect(result.data.funnel.franchise).toBeNull(); expect(state.writes).toEqual([]);
    expect(state.filters).toContainEqual(["dashboard_clients", "slug", "maria-gasolina"]);
    expect(state.filters).toContainEqual(["dashboard_manual_inputs", "client_id", 1]);
  });
  it("payload remoto legado preserva metas e entrega, sem usar resultados comerciais antigos", async () => {
    state.remote = true; state.payload = legacy;
    const result = await loadManualData();
    expect(result.data.goals).toEqual(legacy.goals); expect(result.data.delivery).toEqual(legacy.delivery);
    expect(result.data.results.franchise).toBeNull(); expect(state.payload).toBe(legacy); expect(state.writes).toEqual([]);
  });
  it("salvamento remoto de configuracoes limita cliente e exclui blocos comerciais", async () => {
    state.remote = true; state.ready=true; state.role="editor";
    await saveManualData(legacy);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toMatchObject({ client_id: 1, scope: "business", payload: { goals: legacy.goals, delivery: legacy.delivery } });
    expect(state.writes[0].payload).not.toHaveProperty("funnel"); expect(state.writes[0].payload).not.toHaveProperty("results");
  });
});


describe("ausencia explicita e prioridade das configuracoes", () => {
  it("null explicito nao vira exemplo nem no modo demonstrativo", () => {
    const result = normalize({ funnel: { franchise: null, condominium: null }, results: { franchise: null, condominium: null } }, true);
    expect(result.funnel.franchise).toBeNull(); expect(result.results.condominium).toBeNull();
  });
  it("configuracoes novas prevalecem sem alterar o legado recuperavel", async () => {
    const raw = JSON.stringify(legacy); localStorage.setItem(legacyKey, raw);
    localStorage.setItem(settingsKey, JSON.stringify({ goals: { ...legacy.goals, media_budget: 43210 }, delivery: legacy.delivery }));
    const result = await loadManualData();
    expect(result.data.goals.media_budget).toBe(43210); expect(result.data.results.franchise).toBeNull();
    expect(localStorage.getItem(legacyKey)).toBe(raw);
  });
});

describe("permissões de persistência de metas e configurações",()=>{
  it.each(["viewer","editor","admin"])("%s não grava antes da liberação operacional",async role=>{
    state.remote=true;state.role=role;
    await expect(saveManualData(legacy)).rejects.toThrow("bloqueada");
    expect(state.writes).toEqual([]);expect(localStorage.getItem(settingsKey)).toBeNull();
  });
  it("viewer não grava mesmo com política liberada",async()=>{
    state.remote=true;state.ready=true;
    await expect(saveManualData(legacy)).rejects.toThrow("somente leitura");expect(state.writes).toEqual([]);
  });
  it.each(["editor","admin"])("%s grava no cliente autorizado e mantém valores",async role=>{
    state.remote=true;state.ready=true;state.role=role;
    const result=await saveManualData(legacy);
    expect(result.storage).toBe("supabase");expect(state.writes[0].client_id).toBe(1);
    expect(result.data.goals).toEqual(legacy.goals);
    expect(state.filters).toContainEqual(["returning", "client_id,scope,payload"]);
  });
  it.each(["empty", "null", "client", "scope", "payload", "multiple"])("resposta %s não confirma metas e preserva caches anteriores", async response => {
    state.remote=true;state.ready=true;state.role="editor";state.writeResponse=response;
    const previous=JSON.stringify({goals:{...legacy.goals,media_budget:67890},delivery:legacy.delivery});
    const old=JSON.stringify(legacy);localStorage.setItem(settingsKey,previous);localStorage.setItem(legacyKey,old);
    await expect(saveManualData(legacy)).rejects.toThrow("Não foi possível confirmar a gravação");
    expect(localStorage.getItem(settingsKey)).toBe(previous);expect(localStorage.getItem(legacyKey)).toBe(old);
  });
  it.each(["42501","42P01"])("falha %s não vira sucesso local",async code=>{
    state.remote=true;state.ready=true;state.role="editor";state.writeError={code,message:"gravação recusada"};
    const raw=JSON.stringify(legacy);localStorage.setItem(legacyKey,raw);
    await expect(saveManualData(legacy)).rejects.toMatchObject({code});
    expect(localStorage.getItem(settingsKey)).toBeNull();expect(localStorage.getItem(legacyKey)).toBe(raw);
  });
});
