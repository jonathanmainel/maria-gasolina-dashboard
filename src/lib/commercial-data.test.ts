// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ demo: false, role: "viewer" as string | null, ready: false, rows: [] as any[], stored: [] as any[], error: null as Error | null }));
const trace = vi.hoisted(() => ({ filters: [] as any[], writes: [] as any[], tables: [] as string[] }));
vi.mock("./api", () => ({ CLIENT_SLUG: "maria-gasolina", get isDemoMode() { return state.demo; } }));
vi.mock("./commercial-access", () => ({ loadCommercialAccess: async () => ({ role: state.role, policyReady: state.ready, canEdit: state.ready && ["editor", "admin"].includes(state.role!), clientId: 1, userId: "test-author" }) }));
vi.mock("./supabase", () => ({ supabase: { from: (table: string) => {
  trace.tables.push(table);
  const chain = {
    select: (_: string) => chain,
    eq: (field: string, value: unknown) => { trace.filters.push([table, field, value]); return chain; },
    maybeSingle: async () => ({ data: { id: 1 }, error: null }),
    in: async (field: string, values: string[]) => { trace.filters.push([table, field, values]); return { data: state.rows, error: state.error }; },
    upsert: async (value: any, options: any) => { trace.writes.push([value,options]); if (!state.error) state.rows = [...state.rows.filter(row => row.scope !== value.scope), value]; return { error: state.error }; },
  }; return chain;
} } }));
import { loadCommercialRows, saveCommercialRecord } from "./commercial-data";
import { commercialScope, decodeCommercialRows } from "./commercial-records";
const range = { start: "2026-10-01", end: "2026-10-23" };
const command = { front: "company" as const, kind: "result" as const, range, values: { contracts_closed: 3, revenue: 45000 } };
beforeEach(() => { state.demo = false; state.role = "viewer"; state.ready = false; state.rows = []; state.error = null; trace.filters = []; trace.writes = []; trace.tables = []; localStorage.clear(); });
describe("persistência comercial com transporte simulado, sem banco real", () => {
  it("consulta apenas o cliente exato e os dez scopes da seleção", async () => {
    expect(await loadCommercialRows(range)).toEqual([]);
    expect(trace.filters).toContainEqual(["dashboard_clients", "slug", "maria-gasolina"]);
    expect(trace.filters).toContainEqual(["dashboard_manual_inputs", "client_id", 1]);
    expect(trace.filters.find(item => item[1] === "scope")[2]).toHaveLength(10);
  });
  it.each(["viewer", "editor", "admin", null])("%s não grava enquanto a política não está liberada", async role => {
    state.role = role;
    await expect(saveCommercialRecord(command)).rejects.toThrow("bloqueada"); expect(trace.writes).toEqual([]);
  });
  it("viewer continua sem escrita após liberação", async () => {
    state.ready = true; await expect(saveCommercialRecord(command)).rejects.toThrow("somente leitura"); expect(trace.writes).toEqual([]);
  });
  it.each(["editor", "admin"])("%s salva e recupera somente a frente e o período autorizados", async role => {
    state.role = role; state.ready = true; await saveCommercialRecord(command);
    expect(trace.writes[0][0]).toMatchObject({ client_id: 1, updated_by: "test-author", scope: commercialScope("company", "result", range), payload: { origin: "manual", front: "company", period: range } });
    expect(trace.writes[0][1]).toEqual({onConflict: "client_id,scope"});
    const entries = decodeCommercialRows(await loadCommercialRows(range), range);
    expect(entries.company.result).toEqual(command.values); expect(entries.condominium.result).toBeNull(); expect(entries.franchise.result).toBeNull();
    expect(decodeCommercialRows(state.rows,{...range,end:"2026-10-22"}).company.result).toBeNull();
  });
  it("falha de leitura não recorre a cache comercial legado", async () => {
    localStorage.setItem("mg-dashboard-manual-v1:maria-gasolina", JSON.stringify({results:{company:command.values}})); state.error = new Error("leitura recusada");
    await expect(loadCommercialRows(range)).rejects.toThrow("leitura recusada"); expect(trace.writes).toEqual([]);
  });
  it("falha de escrita é propagada sem sucesso fictício", async () => {
    state.role="editor"; state.ready=true; state.error=new Error("RLS recusou"); await expect(saveCommercialRecord(command)).rejects.toThrow("RLS recusou"); expect(state.rows).toEqual([]);
  });
  it("demo persiste apenas em chave própria do navegador e mantém outras frentes vazias", async () => {
    state.demo=true; state.role="editor"; state.ready=true;
    localStorage.setItem("auth-preserve","untouched"); await saveCommercialRecord(command);
    expect(trace.tables).toEqual([]); expect(trace.writes).toEqual([]);
    const entries=decodeCommercialRows(await loadCommercialRows(range),range);
    expect(entries.company.result).toEqual(command.values); expect(entries.gym.result).toBeNull(); expect(localStorage.getItem("auth-preserve")).toBe("untouched");
    expect(localStorage.getItem("mg-sales-demo-v1:maria-gasolina")).toContain('"company"');
  });
});
